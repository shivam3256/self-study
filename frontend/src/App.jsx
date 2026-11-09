import React, { useState, useEffect, useRef } from 'react';
import { api, getAuthToken, setAuthToken, getStoredUser, getStoredTenant, setStoredUser } from './api';
import {
  deriveAuthStage,
  clearAuthSessionStorage,
  handleEmailNotVerifiedStage,
  isStaleTokenProfileIncomplete,
} from './authLogic';
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
import Details from './pages/Details';
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

function getPageInfo(activeTab, tenantName) {
  switch (activeTab) {
    case 'dashboard':
      return {
        title: 'Library Executive Dashboard',
        subtitle: `Real-time occupancy, student metrics & revenue overview for ${tenantName || 'your library'}.`,
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
}

export default function App() {
  const [token, setToken] = useState(getAuthToken());
  const [user, setUser] = useState(getStoredUser());
  const [tenant, setTenant] = useState(getStoredTenant());
  const [initializingAuth, setInitializingAuth] = useState(!!getAuthToken());
  const [serverConnectionError, setServerConnectionError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [authNotice, setAuthNotice] = useState('');
  const handlingStageInvalidRef = useRef(false);
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
      handleLogout();
    };
    window.addEventListener('auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
  }, []);

  // Listen for auth stage invalidation (e.g. 403 from API)
  useEffect(() => {
    const handleStageInvalid = async (e) => {
      if (handlingStageInvalidRef.current) return;
      handlingStageInvalidRef.current = true;
      try {
        const curToken = getAuthToken();
        const code = e.detail?.code || (typeof e.detail === 'string' ? e.detail : null);

        if (code === 'EMAIL_NOT_VERIFIED') {
          // Clear session and show verify screen for that email (never Details)
          // Fall back to stored user's email before clearing the session
          const currentUser = user || getStoredUser();
          handleEmailNotVerifiedStage({ detail: e.detail, currentUser });
          setAuthToken(null);
          setStoredUser(null, null);
          setToken(null);
          setUser(null);
          setTenant(null);
          return;
        }

        if (code === 'PROFILE_INCOMPLETE') {
          if (!curToken) return;
          try {
            // skipAuthEvents: true ensures getMe & getTenant do NOT dispatch auth-stage-invalid
            const freshUser = await api.auth.getMe({ skipAuthEvents: true });
            setUser(freshUser);
            if (freshUser.tenant_id) {
              try {
                const freshTenant = await api.auth.getTenant({ skipAuthEvents: true });
                setStoredUser(freshUser, freshTenant);
                setTenant(freshTenant);
              } catch (tenantErr) {
                if (isStaleTokenProfileIncomplete(tenantErr)) {
                  handleLogout('Your session is outdated. Please sign in again.');
                  return;
                }
                setStoredUser(freshUser, null);
                setTenant(null);
              }
            } else {
              setStoredUser(freshUser, null);
              setTenant(null);
            }
          } catch (err) {
            if (err.status === 401) {
              handleLogout();
            }
          }
        }
      } finally {
        handlingStageInvalidRef.current = false;
      }
    };
    window.addEventListener('auth-stage-invalid', handleStageInvalid);
    return () => window.removeEventListener('auth-stage-invalid', handleStageInvalid);
  }, [user]);

  // Verify auth and tenant with /auth/me on startup before deciding stage
  useEffect(() => {
    if (!token) {
      setInitializingAuth(false);
      return;
    }
    let active = true;
    const initAuth = async () => {
      try {
        setServerConnectionError(false);
        // Calls made during startup init must not dispatch auth-stage-invalid
        const freshUser = await api.auth.getMe({ skipAuthEvents: true });
        if (!active) return;
        setUser(freshUser);
        if (freshUser.tenant_id) {
          let currentTenant = tenant;
          if (!currentTenant || currentTenant.id !== freshUser.tenant_id || !currentTenant.name) {
            try {
              currentTenant = await api.auth.getTenant({ skipAuthEvents: true });
            } catch (tenantErr) {
              if (isStaleTokenProfileIncomplete(tenantErr)) {
                if (active) {
                  handleLogout('Your session is outdated. Please sign in again.');
                }
                return;
              }
              // For network/temporary errors, keep stub in memory only; do not write stub to localStorage
              if (!currentTenant || currentTenant.id !== freshUser.tenant_id) {
                currentTenant = { id: freshUser.tenant_id };
              }
            }
          }
          // Do not write a stub tenant ({id} only) to localStorage
          if (currentTenant && currentTenant.name) {
            setStoredUser(freshUser, currentTenant);
          } else {
            setStoredUser(freshUser, null);
          }
          if (active) {
            setTenant(currentTenant);
          }
        } else {
          setStoredUser(freshUser, null);
          if (active) {
            setTenant(null);
          }
        }
      } catch (err) {
        if (!active) return;
        if (err.status === 401) {
          // ONLY a 401 clears the session
          handleLogout();
        } else {
          // For network errors or 5xx, keep the stored session intact
          console.warn('Could not reach /auth/me on startup; keeping stored session:', err);
          setServerConnectionError(true);
        }
      } finally {
        if (active) {
          setInitializingAuth(false);
        }
      }
    };
    initAuth();
    return () => {
      active = false;
    };
  }, [token, retryNonce]);

  const loadSharedData = async () => {
    const curToken = getAuthToken();
    if (!curToken) return;
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

  const authStage = deriveAuthStage(token, user, tenant);

  useEffect(() => {
    if (authStage === 'ready') {
      loadSharedData();
    }
  }, [authStage]);

  // Synchronize document title with active tab
  useEffect(() => {
    if (!token) {
      document.title = 'LibMa — Login';
      return;
    }
    const info = getPageInfo(activeTab, tenant?.name);
    const libName = tenant?.name ? ` | ${tenant.name}` : '';
    document.title = `${info.title}${libName} — LibMa`;
  }, [token, activeTab, tenant?.name]);

  const handleLoginSuccess = (userData, tenantData, tokenData) => {
    const nextToken = tokenData || getAuthToken();
    setToken(nextToken);
    setUser(userData);
    setTenant(tenantData || null);
    setServerConnectionError(false);
    setAuthNotice('');
  };

  const handleLogout = (notice = '') => {
    setAuthToken(null);
    setStoredUser(null, null);
    clearAuthSessionStorage();
    setToken(null);
    setUser(null);
    setTenant(null);
    setServerConnectionError(false);
    setAuthNotice(typeof notice === 'string' ? notice : '');
  };

  const handleOpenPayment = (studentId = null, paymentType = 'seat') => {
    setPreselectedStudentIdForPayment(studentId);
    setInitialPaymentTypeForModal(paymentType || 'seat');
    setShowNewPaymentModal(true);
  };

  if (initializingAuth) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F7F5F2',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: '#C2410C',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              margin: '0 auto 16px',
              boxShadow: '0 4px 12px rgba(194, 65, 12, 0.3)',
            }}
          >
            <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>L</span>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1F2933', marginBottom: 8 }}>
            LibMa
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#6B7280', fontSize: '0.875rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: 14,
                height: 14,
                border: '2px solid #C2410C',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'app-spin 0.8s linear infinite',
              }}
            />
            <span>Loading your workspace…</span>
          </div>
          <style>{`@keyframes app-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (serverConnectionError && (!tenant || !tenant.id)) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F7F5F2',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 440, width: '100%', textAlign: 'center', padding: '36px 28px', background: '#FFFFFF', borderRadius: 24, boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#FEF2F2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>!</span>
          </div>
          <h3 style={{ fontSize: '1.25rem', color: '#1F2933', margin: '0 0 8px 0', fontWeight: 700 }}>Unable to Connect</h3>
          <p style={{ color: '#6B7280', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: 24 }}>
            We could not verify your account status with the server. Please check your internet connection and try again.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              className="btn btn-primary"
              style={{ borderRadius: 9999, padding: '10px 24px', background: '#C2410C', borderColor: '#C2410C' }}
              onClick={() => {
                setInitializingAuth(true);
                setServerConnectionError(false);
                setRetryNonce((n) => n + 1);
              }}
            >
              Retry Connection
            </button>
            <button
              style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: '0.875rem' }}
              onClick={handleLogout}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (authStage === 'logged_out') {
    return (
      <ErrorBoundary>
        <Auth
          onLoginSuccess={handleLoginSuccess}
          initialMessage={authNotice}
          onNoticeCleared={() => setAuthNotice('')}
        />
      </ErrorBoundary>
    );
  }

  if (authStage === 'needs_details') {
    return (
      <ErrorBoundary>
        <Details
          user={user}
          onDetailsSuccess={handleLoginSuccess}
          onLogout={handleLogout}
        />
      </ErrorBoundary>
    );
  }

  const pageInfo = getPageInfo(activeTab, tenant?.name);

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
