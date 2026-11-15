import React, { useState, useEffect } from 'react';
import { Search, Filter, ShieldAlert, ArrowUpDown, ArrowRight, RefreshCw, Building2, CheckSquare, Square } from 'lucide-react';
import { adminApi } from './adminApi';
import AdminLibraryDetailModal from './AdminLibraryDetailModal';

export default function AdminLibraries() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expiryFilter, setExpiryFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [hideTestLibraries, setHideTestLibraries] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedLibraryId, setSelectedLibraryId] = useState(null);

  const fetchLibraries = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.libraries.list({
        search,
        plan: planFilter,
        status: statusFilter,
        expiry_filter: expiryFilter,
        sort_by: sortBy,
        sort_order: sortOrder,
        page,
        page_size: pageSize,
      });
      setItems(res.items || []);
      setTotal(res.total || 0);
      setTotalPages(res.total_pages || 1);
    } catch (err) {
      setError(err.message || 'Failed to fetch libraries list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibraries();
  }, [page, pageSize, planFilter, statusFilter, expiryFilter, sortBy, sortOrder]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchLibraries();
  };

  // Filter out test/proxy generated libraries if toggle is on
  const displayedItems = hideTestLibraries
    ? items.filter((lib) => {
        const testKeywords = ['test', 'reset', 'disposable', 'onboard', 'dummy', 'fake', 'unique', 'delete', 'overlap'];
        const nameLower = (lib.name || '').toLowerCase();
        const emailLower = (lib.email || '').toLowerCase();
        const isTest = testKeywords.some((kw) => nameLower.includes(kw) || emailLower.includes(kw)) || emailLower.endsWith('@example.com');
        return !isTest;
      })
    : items;

  return (
    <div>
      {/* Title & Refresh */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--color-heading, #1C1917)', letterSpacing: '-0.02em' }}>
            Library Centers Directory
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary, #57534E)', margin: 0 }}>
            Overview, search, and manage subscriptions across {total} centers
          </p>
        </div>
        <button
          onClick={fetchLibraries}
          className="admin-btn admin-btn-secondary"
          title="Refresh list"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="admin-filter-bar">
        <form onSubmit={handleSearchSubmit} className="admin-filter-group" style={{ flex: 1, minWidth: 260 }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--color-text-muted, #78716C)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by library name, owner, email, city…"
              className="admin-input"
              style={{ width: '100%', paddingLeft: 38, boxSizing: 'border-box' }}
            />
          </div>
        </form>

        <div className="admin-filter-group">
          <select
            value={planFilter}
            onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
            className="admin-select"
          >
            <option value="">All Plans</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="admin-select"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="expired">Expired</option>
            <option value="suspended">Suspended</option>
          </select>

          <select
            value={expiryFilter}
            onChange={(e) => { setExpiryFilter(e.target.value); setPage(1); }}
            className="admin-select"
          >
            <option value="">All Expiries</option>
            <option value="active">Active Memberships</option>
            <option value="expiring_7d">Expiring in 7 Days</option>
            <option value="expiring_30d">Expiring in 30 Days</option>
            <option value="expired">Expired Memberships</option>
          </select>

          <select
            value={`${sortBy}:${sortOrder}`}
            onChange={(e) => {
              const [sb, so] = e.target.value.split(':');
              setSortBy(sb);
              setSortOrder(so);
              setPage(1);
            }}
            className="admin-select"
          >
            <option value="created_at:desc">Newest First</option>
            <option value="created_at:asc">Oldest First</option>
            <option value="name:asc">Name A-Z</option>
            <option value="name:desc">Name Z-A</option>
            <option value="subscription_expires_at:asc">Expiry Soonest</option>
          </select>

          {/* Quick toggle to filter out automated test/mock libraries */}
          <button
            type="button"
            onClick={() => setHideTestLibraries(!hideTestLibraries)}
            className={`admin-btn ${hideTestLibraries ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            style={{ fontSize: '0.75rem', padding: '7px 12px' }}
            title="Toggle hiding automated test libraries"
          >
            {hideTestLibraries ? <CheckSquare size={14} /> : <Square size={14} />}
            <span>Hide Test Libraries</span>
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: 'var(--danger-bg, #FEF2F2)',
          border: '1px solid var(--danger-border, #FECACA)',
          borderRadius: 10,
          padding: 12,
          color: 'var(--danger-text, #991B1B)',
          fontSize: '0.8125rem',
          marginBottom: 16
        }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Library Center</th>
              <th>Owner & Contact</th>
              <th>Plan</th>
              <th>Subscription Status</th>
              <th>Expiry Date</th>
              <th>Capacity</th>
              <th>Enrolled</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {displayedItems.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--color-text-muted, #78716C)' }}>
                  {loading ? 'Loading library centers…' : 'No library centers match your selected filters.'}
                </td>
              </tr>
            ) : (
              displayedItems.map((lib) => (
                <tr key={lib.id}>
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--color-heading, #1C1917)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{lib.name}</span>
                      {!lib.is_active && (
                        <span style={{ fontSize: '0.65rem', background: 'var(--danger-bg, #FEF2F2)', color: 'var(--danger-text, #991B1B)', border: '1px solid var(--danger-border, #FECACA)', padding: '1px 6px', borderRadius: 4 }}>
                          Suspended
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--color-text-muted, #78716C)', marginTop: 2 }}>
                      {lib.city ? `${lib.city}, ${lib.state || ''}` : 'Location N/A'}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--color-heading, #1C1917)', fontSize: '0.8rem' }}>
                      {lib.owner_name || 'No Owner Listed'}
                    </div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--color-text-secondary, #57534E)' }}>
                      {lib.email} {lib.phone ? `• ${lib.phone}` : ''}
                    </div>
                  </td>
                  <td>
                    <span style={{
                      background: 'var(--bg-page, #FAFAF9)',
                      color: 'var(--color-heading, #1C1917)',
                      border: '1px solid var(--color-border, #E7E5E4)',
                      fontSize: '0.725rem',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 4,
                      textTransform: 'uppercase'
                    }}>
                      {lib.subscription_tier}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                      <span className={`admin-pill ${lib.subscription_status}`}>
                        {lib.subscription_status}
                      </span>
                      {lib.manually_overridden && (
                        <span className="admin-pill overridden" title={lib.override_reason || 'Manual override active'}>
                          <ShieldAlert size={11} />
                          <span>Overridden</span>
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-heading, #1C1917)' }}>
                      {lib.subscription_expires_at ? new Date(lib.subscription_expires_at).toLocaleDateString() : 'None'}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #57534E)' }}>
                      <strong>{lib.seats_count}</strong> Seats • <strong>{lib.lockers_count}</strong> Lockers
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-brand, #C2410C)' }}>
                      {lib.students_count}
                    </div>
                  </td>
                  <td>
                    <button
                      onClick={() => setSelectedLibraryId(lib.id)}
                      className="admin-btn admin-btn-secondary"
                      style={{ padding: '5px 12px', fontSize: '0.75rem' }}
                    >
                      <span>Manage</span>
                      <ArrowRight size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #57534E)' }}>
          Showing {displayedItems.length} of {total} centers (Page {page} of {totalPages})
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="admin-btn admin-btn-secondary"
            style={{ padding: '6px 14px', fontSize: '0.75rem' }}
          >
            Previous
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="admin-btn admin-btn-secondary"
            style={{ padding: '6px 14px', fontSize: '0.75rem' }}
          >
            Next
          </button>
        </div>
      </div>

      {selectedLibraryId && (
        <AdminLibraryDetailModal
          libraryId={selectedLibraryId}
          onClose={() => setSelectedLibraryId(null)}
          onRefreshList={fetchLibraries}
        />
      )}
    </div>
  );
}
