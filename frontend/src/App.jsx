import React, { useState, useEffect } from 'react';
import { api, getAuthToken, setAuthToken, getStoredUser, getStoredTenant, setStoredUser } from './api';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Dashboard from './pages/Dashboard';
import SeatMap from './pages/SeatMap';
import LockerMap from './pages/LockerMap';
import Students from './pages/Students';
import Billing from './pages/Billing';
import Budget from './pages/Budget';
import Attendance from './pages/Attendance';
import Reminders from './pages/Reminders';
import Settings from './pages/Settings';
import AccountSettings from './pages/AccountSettings';
import Auth from './pages/Auth';
import NewStudentModal from './components/NewStudentModal';
import NewPaymentModal from './components/NewPaymentModal';
import ReceiptModal from './components/ReceiptModal';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div className="card" style={{ maxWidth: 500, margin: '40px auto', padding: 32 }}>
            <h3 style={{ color: 'var(--danger-text)', marginBottom: 12 }}>Something went wrong</h3>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 20 }}>
              {this.state.error?.message || 'An unexpected error occurred while loading this view.'}
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  const [initialPaymentTypeForModal, setInitialPaymentTypeForModal] = useState('seat');
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

  // Synchronize document title with active tab
  useEffect(() => {
    const info = getPageInfo();
    const libName = tenant?.name ? ` | ${tenant.name}` : '';
    document.title = `${info.title}${libName} — LibMa`;
  }, [activeTab, tenant?.name]);

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

  const handleOpenPayment = (studentId = null, paymentType = 'seat') => {
    setPreselectedStudentIdForPayment(studentId);
    setInitialPaymentTypeForModal(paymentType || 'seat');
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
      case 'lockers':
        return {
          title: 'Locker Management & Allocations',
          subtitle: 'Visual locker grid, storage assignments, renewals, security deposits and maintenance tracking.',
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
      case 'budget':
        return {
          title: 'Budget, Expenses & Profit Analytics',
          subtitle: 'Monitor monthly revenue, log center operating expenses (electricity, rent, salaries, misc), and track net profit margins.',
        };
      case 'attendance':
        return {
          title: 'Daily Attendance & QR Check-In',
          subtitle: 'Verify student entry/exit and monitor active physical study presence in real-time.',
        };
      case 'reminders':
        return {
          title: 'Automated WhatsApp Fee Reminders',
          subtitle: 'Scheduled notifications sent 7/3/1 days before due dates and on overdue status via WhatsApp.',
        };
      case 'settings':
        return {
          title: 'Library Settings & Floor Configuration',
          subtitle: 'Configure library seat layout, floor zones, shift hours, and membership pricing plans.',
        };
      case 'account-settings':
        return {
          title: 'Account Settings & Library Profile',
          subtitle: 'Manage your library profile, branding, contact details, and account credentials.',
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
          <ErrorBoundary key={activeTab}>
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

            {activeTab === 'lockers' && (
              <LockerMap
                students={students}
                onOpenPayment={handleOpenPayment}
                onViewReceipt={(rcpt) => setCurrentReceipt(rcpt)}
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

            {activeTab === 'budget' && (
              <Budget tenant={tenant} />
            )}

            {activeTab === 'attendance' && (
              <Attendance students={students} />
            )}

            {activeTab === 'reminders' && (
              <Reminders />
            )}

            {activeTab === 'settings' && (
              <Settings
                tenant={tenant}
                shifts={shifts}
                plans={plans}
                onTenantUpdated={(newTenant) => setTenant(newTenant)}
                onRefreshData={loadSharedData}
                onLogout={handleLogout}
              />
            )}

            {activeTab === 'account-settings' && (
              <AccountSettings
                tenant={tenant}
                user={user}
                onTenantUpdated={(newTenant) => setTenant(newTenant)}
                onLogout={handleLogout}
              />
            )}

            {!['dashboard', 'seatmap', 'lockers', 'students', 'billing', 'budget', 'attendance', 'reminders', 'settings', 'account-settings'].includes(activeTab) && (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div className="card" style={{ maxWidth: 480, margin: '0 auto', padding: '36px 24px' }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>404</span>
                  </div>
                  <h3 style={{ fontSize: '1.25rem', color: 'var(--color-heading)', marginBottom: 8 }}>Page Not Found</h3>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: 20 }}>
                    The view or section you requested doesn't exist or may have moved.
                  </p>
                  <button className="btn btn-primary" onClick={() => setActiveTab('dashboard')}>
                    Return to Dashboard
                  </button>
                </div>
              </div>
            )}
          </ErrorBoundary>
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
          initialPaymentType={initialPaymentTypeForModal}
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
