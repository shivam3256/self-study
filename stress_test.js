import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom Metrics
export const errorRate = new Rate('custom_error_rate');
export const apiDuration = new Trend('custom_api_duration');
export const studentMutations = new Counter('custom_students_created');
export const expenseMutations = new Counter('custom_expenses_created');

// Stress Test Load Profile: 5-minute ramp up to 200 VUs
export const options = {
  stages: [
    { duration: '30s', target: 25 },    // Stage 1: Warm-up / Smoke (25 VUs)
    { duration: '1m',  target: 100 },   // Stage 2: Load Ramp (100 VUs)
    { duration: '1m30s', target: 200 }, // Stage 3: Extreme Stress Ramp (200 VUs)
    { duration: '1m',  target: 200 },   // Stage 4: Sustained Peak Stress (200 VUs)
    { duration: '30s', target: 0 },     // Stage 5: Cool-down Ramp to 0
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],     // Target: Error rate below 10% under extreme 200 VU stress
    http_req_duration: ['p(95)<4000'],  // Target: 95% of requests under 4.0s
    custom_error_rate: ['rate<0.10'],
  },
};

const FRONTEND_BASE = 'https://trishshop.in';
const API_BASE = 'https://api.trishshop.in/api/v1';

// Test Account Pool
const ACCOUNTS = [
  { email: 'kumarsinghshivam325@gmail.com', password: 'shivam1234' },
  { email: 'kumarsinghshivam905@gmail.com', password: 'Shivam@9797' },
];

// Global Setup: Authenticate both accounts once to obtain tokens
export function setup() {
  const tokens = [];
  for (const acc of ACCOUNTS) {
    const payload = JSON.stringify({ email: acc.email, password: acc.password });
    const res = http.post(`${API_BASE}/auth/login`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (res.status === 200) {
      const data = res.json();
      tokens.push(data.access_token);
    } else {
      console.error(`Setup login failed for ${acc.email}: HTTP ${res.status}`);
    }
  }

  return { tokens };
}

export default function (data) {
  const tokens = data.tokens || [];
  // Distribute requests across both test accounts
  const token = tokens[__VU % (tokens.length || 1)];

  const authHeaders = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const publicHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };

  // 1. Frontend & Static Assets Flow
  group('01_Frontend_Static_Assets', () => {
    const resHome = http.get(FRONTEND_BASE, { headers: publicHeaders });
    const passedHome = check(resHome, {
      'Frontend Home status is 200': (r) => r.status === 200,
    });
    errorRate.add(!passedHome);
    apiDuration.add(resHome.timings.duration);

    const resHealth = http.get(`${FRONTEND_BASE}/health`, { headers: publicHeaders });
    check(resHealth, { 'Frontend Health status is 200': (r) => r.status === 200 });

    const resAsset = http.get(`${FRONTEND_BASE}/assets/index-CiHT6B16.js`, { headers: publicHeaders });
    check(resAsset, { 'JS Asset status is 200': (r) => r.status === 200 });
  });

  sleep(0.3);

  // 2. Auth & Tenant Profile
  group('02_Auth_Profile', () => {
    const resMe = http.get(`${API_BASE}/auth/me`, { headers: authHeaders });
    const passedMe = check(resMe, {
      'Auth /me status is 200': (r) => r.status === 200,
    });
    errorRate.add(!passedMe);
    apiDuration.add(resMe.timings.duration);

    const resTenant = http.get(`${API_BASE}/auth/tenant`, { headers: authHeaders });
    check(resTenant, { 'Auth /tenant status is 200': (r) => r.status === 200 });
  });

  sleep(0.3);

  // 3. Dashboard Analytics
  group('03_Dashboard_Summary', () => {
    const resDash = http.get(`${API_BASE}/dashboard/summary`, { headers: authHeaders });
    const passed = check(resDash, {
      'Dashboard Summary status is 200': (r) => r.status === 200,
      'Dashboard has valid structure': (r) => r.body && r.body.length > 0,
    });
    errorRate.add(!passed);
    apiDuration.add(resDash.timings.duration);
  });

  sleep(0.3);

  // 4. Desks & Real-time Seat Map
  group('04_Desks_SeatMap', () => {
    const resDesks = http.get(`${API_BASE}/desks`, { headers: authHeaders });
    check(resDesks, { 'Desks list status is 200': (r) => r.status === 200 });
    apiDuration.add(resDesks.timings.duration);

    const resSeatMap = http.get(`${API_BASE}/desks/seat-map`, { headers: authHeaders });
    check(resSeatMap, { 'Seat Map status is 200': (r) => r.status === 200 });
    apiDuration.add(resSeatMap.timings.duration);
  });

  sleep(0.3);

  // 5. Shifts & Membership Plans
  group('05_Shifts_and_Plans', () => {
    const resShifts = http.get(`${API_BASE}/shifts`, { headers: authHeaders });
    check(resShifts, { 'Shifts list status is 200': (r) => r.status === 200 });

    const resPlans = http.get(`${API_BASE}/plans`, { headers: authHeaders });
    check(resPlans, { 'Plans list status is 200': (r) => r.status === 200 });
  });

  sleep(0.3);

  // 6. Students Directory & Search
  group('06_Students_Directory', () => {
    const resStudents = http.get(`${API_BASE}/students?limit=50`, { headers: authHeaders });
    check(resStudents, { 'Students list status is 200': (r) => r.status === 200 });
    apiDuration.add(resStudents.timings.duration);

    const resSearch = http.get(`${API_BASE}/students?search=test&status=active`, { headers: authHeaders });
    check(resSearch, { 'Students search status is 200': (r) => r.status === 200 });
  });

  sleep(0.3);

  // 7. Allocations
  group('07_Allocations', () => {
    const resAlloc = http.get(`${API_BASE}/allocations?status_filter=active`, { headers: authHeaders });
    check(resAlloc, { 'Allocations list status is 200': (r) => r.status === 200 });
    apiDuration.add(resAlloc.timings.duration);
  });

  sleep(0.3);

  // 8. Payments & Outstanding Dues
  group('08_Payments_Dues', () => {
    const resPay = http.get(`${API_BASE}/payments?limit=50`, { headers: authHeaders });
    check(resPay, { 'Payments list status is 200': (r) => r.status === 200 });

    const resDues = http.get(`${API_BASE}/payments/outstanding-dues`, { headers: authHeaders });
    check(resDues, { 'Outstanding dues status is 200': (r) => r.status === 200 });
  });

  sleep(0.3);

  // 9. Attendance Tracking
  group('09_Attendance_Today', () => {
    const resAtt = http.get(`${API_BASE}/attendance/today`, { headers: authHeaders });
    check(resAtt, { 'Attendance today status is 200': (r) => r.status === 200 });
  });

  sleep(0.3);

  // 10. Expenses & Financial Budget
  group('10_Expenses_Budget', () => {
    const resExp = http.get(`${API_BASE}/expenses?limit=50`, { headers: authHeaders });
    check(resExp, { 'Expenses list status is 200': (r) => r.status === 200 });

    const resSum = http.get(`${API_BASE}/expenses/summary`, { headers: authHeaders });
    check(resSum, { 'Expenses summary status is 200': (r) => r.status === 200 });
  });

  sleep(0.3);

  // 11. Automated Reminders Logs
  group('11_Reminders_Logs', () => {
    const resRem = http.get(`${API_BASE}/reminders/logs`, { headers: authHeaders });
    check(resRem, { 'Reminders log status is 200': (r) => r.status === 200 });
  });

  sleep(0.3);

  // 12. Safe Mutation Lifecycle (Executed conditionally per VU cycle: Create -> Verify -> Delete)
  if (Math.random() < 0.20) {
    group('12_Safe_Mutation_Lifecycle', () => {
      const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;

      // Create test student
      const studentPayload = JSON.stringify({
        full_name: `StressTest Student ${uniqueSuffix}`,
        phone: `99${Math.floor(10000000 + Math.random() * 90000000)}`,
        gender: 'male',
        id_proof_type: 'Aadhaar',
        id_proof_number: `ST-${uniqueSuffix}`,
        notes: 'k6 automated stress test',
      });

      const resCreateStudent = http.post(`${API_BASE}/students`, studentPayload, { headers: authHeaders });
      const createdStudentOk = check(resCreateStudent, {
        'Create Student status is 201': (r) => r.status === 201,
      });

      if (createdStudentOk) {
        studentMutations.add(1);
        const studentId = resCreateStudent.json('id');

        // Delete test student to ensure clean state
        const resDelStudent = http.del(`${API_BASE}/students/${studentId}`, null, { headers: authHeaders });
        check(resDelStudent, {
          'Delete Student status is 200 or 204': (r) => r.status === 200 || r.status === 204,
        });
      }

      // Create test expense
      const expensePayload = JSON.stringify({
        title: `StressTest Expense ${uniqueSuffix}`,
        category: 'miscellaneous',
        amount: 25.0,
        expense_date: new Date().toISOString().split('T')[0],
        payment_mode: 'cash',
        remarks: 'k6 automated stress test',
      });

      const resCreateExp = http.post(`${API_BASE}/expenses`, expensePayload, { headers: authHeaders });
      const createdExpOk = check(resCreateExp, {
        'Create Expense status is 201': (r) => r.status === 201,
      });

      if (createdExpOk) {
        expenseMutations.add(1);
        const expenseId = resCreateExp.json('id');

        // Delete test expense to ensure clean state
        const resDelExp = http.del(`${API_BASE}/expenses/${expenseId}`, null, { headers: authHeaders });
        check(resDelExp, {
          'Delete Expense status is 200 or 204': (r) => r.status === 200 || r.status === 204,
        });
      }
    });
  }

  sleep(0.5);
}
