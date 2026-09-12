import React, { useState, useEffect } from 'react';
import { api, getAuthToken, setAuthToken, getStoredUser, getStoredTenant, setStoredUser } from './api';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Dashboard from './pages/Dashboard';
import SeatMap from './pages/SeatMap';
import Students from './pages/Students';
import Billing from './pages/Billing';
import Attendance from './pages/Attendance';
import Reminders from './pages/Reminders';
import Auth from './pages/Auth';
import NewStudentModal from './components/NewStudentModal';
import NewPaymentModal from './components/NewPaymentModal';
import ReceiptModal from './components/ReceiptModal';

export default function App() {
  const [token, setToken] = useState(getAuthToken());
  const [user, setUser] = useState(getStoredUser());
  const [tenant, setTenant] = useState(getStoredTenant());
  const [activeTab, setActiveTab] = useState('dashboard');

  // Shared library data
  const [students, setStudents] = useState([]);
  const [plans, setPlans] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  // Modals state
  const [showNewStudentModal, setShowNewStudentModal] = useState(false);
  const [showNewPaymentModal, setShowNewPaymentModal] = useState(false);
  const [preselectedStudentIdForPayment, setPreselectedStudentIdForPayment] = useState(null);
  const [currentReceipt, setCurrentReceipt] = useState(null);

  // Listen for unauthorized events
  useEffect(() => {
    const handleUnauthorized = () => {
      setToken(null);
      setUser(null);
      setTenant(null);
    };
    window.addEventListener('auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
  }, []);

  const loadSharedData = async () => {
    if (!token) return;
    try {
      setLoadingData(true);
      const [stuList, planList, shiftList] = await Promise.all([
        api.students.list(),
        api.plans.list(),
        api.shifts.list(),
      ]);
      setStudents(stuList);
      setPlans(planList);
      setShifts(shiftList);
    } catch (err) {
      console.error('Error loading library resources:', err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadSharedData();
    }
  }, [token]);

  const handleLoginSuccess = (userData, tenantData) => {
    setToken(getAuthToken());
    setUser(userData);
    setTenant(tenantData);
  };

  const handleLogout = () => {
    setAuthToken(null);
    setStoredUser(null, null);
    setToken(null);
    setUser(null);
    setTenant(null);
  };

  const handleOpenPayment = (studentId = null) => {
    setPreselectedStudentIdForPayment(studentId);
    setShowNewPaymentModal(true);
  };

  if (!token) {
    return <Auth onLoginSuccess={handleLoginSuccess} />;
  }

  const getPageInfo = () => {
    switch (activeTab) {
      case 'dashboard':
        return {
          title: 'Library Executive Dashboard',
          subtitle: `Real-time occupancy, student metrics & revenue overview for ${tenant?.name || 'your library'}.`,
        };
      case 'seatmap':
        return {
          title: 'Interactive Visual Seat Map',
          subtitle: 'Real-time floor plan layout. Click any desk to assign or vacate seats across shifts.',
        };
      case 'students':
        return {
          title: 'Student Directory & Memberships',
          subtitle: 'Search, filter, manage enrollments, and pause/resume student memberships.',
        };
      case 'billing':
        return {
          title: 'Fee Billing & Receipt Generation',
          subtitle: 'Collect fees, monitor outstanding dues, and generate printable GST/standard receipts.',
        };
      case 'attendance':
        return {
          title: 'Daily Attendance & QR Check-In',
          subtitle: 'Verify student entry/exit and monitor active physical study presence in real-time.',
        };
      case 'reminders':
        return {
          title: 'Automated SMS Fee Reminders',
          subtitle: 'Scheduled notifications sent 7/3/1 days before due dates and on overdue status.',
        };
      default:
        return { title: 'Self-Study Management', subtitle: '' };
    }
  };

  const pageInfo = getPageInfo();

  return (
    <div className="app-container">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        tenant={tenant}
        onLogout={handleLogout}
      />

      {/* Main Panel */}
      <div className="main-wrapper">
        <TopBar
          title={pageInfo.title}
          subtitle={pageInfo.subtitle}
          tenant={tenant}
          onOpenNewStudent={() => setShowNewStudentModal(true)}
          onOpenNewPayment={() => handleOpenPayment(null)}
        />

        <main className="content-body">
          {activeTab === 'dashboard' && (
            <Dashboard
              setActiveTab={setActiveTab}
              onOpenNewStudent={() => setShowNewStudentModal(true)}
              onOpenNewPayment={() => handleOpenPayment(null)}
            />
          )}

          {activeTab === 'seatmap' && (
            <SeatMap
              students={students}
              onRefreshStudents={loadSharedData}
            />
          )}

          {activeTab === 'students' && (
            <Students
              students={students}
              loading={loadingData}
              onRefresh={loadSharedData}
              onOpenNewStudent={() => setShowNewStudentModal(true)}
              onOpenNewPayment={handleOpenPayment}
            />
          )}

          {activeTab === 'billing' && (
            <Billing
              onOpenNewPayment={handleOpenPayment}
              onViewReceipt={(rcpt) => setCurrentReceipt(rcpt)}
            />
          )}

          {activeTab === 'attendance' && (
            <Attendance students={students} />
          )}

          {activeTab === 'reminders' && (
            <Reminders />
          )}
        </main>
      </div>

      {/* Modals */}
      {showNewStudentModal && (
        <NewStudentModal
          onClose={() => setShowNewStudentModal(false)}
          onSuccess={loadSharedData}
        />
      )}

      {showNewPaymentModal && (
        <NewPaymentModal
          students={students}
          plans={plans}
          preselectedStudentId={preselectedStudentIdForPayment}
          onClose={() => setShowNewPaymentModal(false)}
          onSuccess={(issuedReceipt) => {
            loadSharedData();
            if (issuedReceipt) {
              setCurrentReceipt(issuedReceipt);
            }
          }}
        />
      )}

      {currentReceipt && (
        <ReceiptModal
          receipt={currentReceipt}
          onClose={() => setCurrentReceipt(null)}
        />
      )}
    </div>
  );
}
