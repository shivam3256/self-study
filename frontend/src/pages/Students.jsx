import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Pause,
  Play,
  Trash2,
  CreditCard,
  UserCheck,
  ShieldAlert,
  Sparkles,
  FileSpreadsheet,
  Armchair,
  UserX,
  MoreVertical,
  Phone,
  MessageSquare,
  Eye,
  Edit,
  LogOut,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { api } from '../api';
import ImportStudentsModal from '../components/ImportStudentsModal';
import StudentSeatModal from '../components/StudentSeatModal';
import EditStudentModal from '../components/EditStudentModal';
import StudentDetailsModal from '../components/StudentDetailsModal';
import TablePagination from '../components/TablePagination';
import { useToast } from '../context/ToastContext';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

function WhatsAppIcon({ size = 16, color = '#22C55E' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.16 12.04 20.16C10.67 20.16 9.32 19.8 8.14 19.11L7.84 18.93L4.72 19.75L5.55 16.71L5.35 16.39C4.6 15.19 4.21 13.57 4.21 11.91C4.21 7.37 7.91 3.67 12.05 3.67ZM8.82 7.02C8.63 7.02 8.44 7.03 8.27 7.04C8.04 7.05 7.82 7.15 7.67 7.33C7.45 7.57 6.87 8.12 6.87 9.24C6.87 10.36 7.69 11.44 7.81 11.6C7.93 11.76 9.42 14.06 11.7 15.05C13.6 15.87 14 15.7 14.43 15.66C14.86 15.62 15.82 15.09 16.02 14.52C16.22 13.95 16.22 13.47 16.16 13.37C16.1 13.27 15.94 13.21 15.7 13.09C15.46 12.97 14.28 12.39 14.06 12.31C13.84 12.23 13.68 12.19 13.52 12.43C13.36 12.67 12.9 13.21 12.76 13.37C12.62 13.53 12.48 13.55 12.24 13.43C12 13.31 11.23 13.06 10.31 12.24C9.59 11.6 9.11 10.81 8.97 10.57C8.83 10.33 8.95 10.2 9.07 10.08C9.18 9.97 9.32 9.79 9.44 9.65C9.56 9.51 9.6 9.41 9.68 9.25C9.76 9.09 9.72 8.95 9.66 8.83C9.6 8.71 9.14 7.57 8.95 7.11C8.76 6.66 8.57 6.72 8.42 6.71C8.28 6.7 8.12 6.7 8.82 7.02Z"/>
    </svg>
  );
}

function SortHeader({ field, currentField, direction, onSort, children }) {
  const isActive = currentField === field;
  return (
    <th
      onClick={() => onSort(field)}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span>{children}</span>
        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp size={13} style={{ color: 'var(--color-brand)' }} />
          ) : (
            <ArrowDown size={13} style={{ color: 'var(--color-brand)' }} />
          )
        ) : (
          <ArrowUpDown size={12} style={{ opacity: 0.35 }} />
        )}
      </div>
    </th>
  );
}

export default function Students({
  students,
  loading,
  onRefresh,
  onOpenNewStudent,
  onOpenNewPayment,
}) {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [seatModalStudent, setSeatModalStudent] = useState(null);

  // Pagination & Sorting State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState('full_name');
  const [sortDirection, setSortDirection] = useState('asc');

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Dropdown Action Menu State
  const [activeMenuStudent, setActiveMenuStudent] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: null, bottom: null, right: 0 });
  const menuRef = useRef(null);

  // Modals for View Details and Edit
  const [detailsModalStudent, setDetailsModalStudent] = useState(null);
  const [editModalStudent, setEditModalStudent] = useState(null);

  // Close dropdown on click outside, scroll, or Escape key
  useEffect(() => {
    if (!activeMenuStudent) return;

    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenuStudent(null);
      }
    };

    const handleScroll = (e) => {
      // If user scrolls anywhere, close the open menu
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenuStudent(null);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveMenuStudent(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMenuStudent]);

  const handleToggleMenu = (e, student) => {
    e.stopPropagation();
    if (activeMenuStudent?.id === student.id) {
      setActiveMenuStudent(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const approxMenuHeight = 350;
    const spaceBelow = window.innerHeight - rect.bottom;

    let top = null;
    let bottom = null;

    if (spaceBelow < approxMenuHeight && rect.top > approxMenuHeight) {
      bottom = window.innerHeight - rect.top + 4;
    } else {
      top = rect.bottom + 4;
    }

    setMenuPosition({
      top,
      bottom,
      right: Math.max(12, window.innerWidth - rect.right),
    });
    setActiveMenuStudent(student);
  };

  const closeMenu = () => {
    setActiveMenuStudent(null);
  };

  const getCleanPhone = (phone) => {
    if (!phone || phone === 'N/A') return null;
    return phone.replace(/[^0-9+]/g, '');
  };

  const getWhatsAppDigits = (phone) => {
    if (!phone || phone === 'N/A') return null;
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      digits = `91${digits}`;
    }
    return digits;
  };

  const handleCall = (student) => {
    closeMenu();
    const clean = getCleanPhone(student.phone);
    if (!clean) {
      toast.warning(`No phone number available for ${student.full_name}.`);
      return;
    }
    window.location.href = `tel:${clean}`;
  };

  const handleSms = (student) => {
    closeMenu();
    const clean = getCleanPhone(student.phone);
    if (!clean) {
      toast.warning(`No phone number available for ${student.full_name}.`);
      return;
    }
    const text = encodeURIComponent(`Hello ${student.full_name}, `);
    window.location.href = `sms:${clean}?body=${text}`;
  };

  const handleWhatsApp = (student) => {
    closeMenu();
    const digits = getWhatsAppDigits(student.phone);
    if (!digits) {
      toast.warning(`No phone number available for ${student.full_name}.`);
      return;
    }
    const text = encodeURIComponent(`Hello ${student.full_name}, `);
    window.open(`https://wa.me/${digits}?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone.includes(searchTerm) ||
      s.admission_number.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ? true : s.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const sortedStudents = [...filteredStudents].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];

    if (sortField === 'full_name') {
      aVal = (a.full_name || '').toLowerCase();
      bVal = (b.full_name || '').toLowerCase();
    } else if (sortField === 'admission_number') {
      aVal = a.admission_number || '';
      bVal = b.admission_number || '';
    } else if (sortField === 'expiry_date') {
      aVal = a.expiry_date || '';
      bVal = b.expiry_date || '';
    } else if (sortField === 'status') {
      aVal = a.status || '';
      bVal = b.status || '';
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const paginatedStudents = sortedStudents.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handlePause = async (studentId) => {
    closeMenu();
    if (!window.confirm('Pause this membership? The student can resume later with expiry date extended.')) return;
    try {
      setActionLoading(studentId);
      try {
        const activeLocker = await api.lockers.getActiveForStudent(studentId);
        if (activeLocker) {
          const shouldRelease = window.confirm(
            `Notice: This student also holds Locker ${activeLocker.label}.\n\n` +
            `Do you want to release the locker assignment as well?\n\n` +
            `Click OK to RELEASE Locker ${activeLocker.label}, or Cancel to KEEP the locker assigned.`
          );
          if (shouldRelease) {
            await api.lockers.release(activeLocker.locker_id, { refund_deposit: true });
          }
        }
      } catch (lErr) {
        // ignore
      }

      await api.students.pause(studentId);
      toast.success('Membership paused.');
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleResume = async (studentId) => {
    closeMenu();
    try {
      setActionLoading(studentId);
      await api.students.resume(studentId);
      toast.success('Membership resumed.');
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleMarkLeft = async (studentId, name) => {
    closeMenu();
    if (!window.confirm(
      `Mark ${name} as Left?\n\n` +
      `This will immediately:\n` +
      `1. Set student status to "Left"\n` +
      `2. Vacate their assigned study seat\n` +
      `3. Release any assigned locker.`
    )) return;

    try {
      setActionLoading(studentId);
      await api.students.markLeft(studentId);
      toast.success(`${name} marked as Left.`);
      onRefresh();
    } catch (err) {
      toast.error(err.message || 'Failed to mark student as left.');
    } finally {
      setActionLoading('');
    }
  };

  const handleDelete = async (studentId, name) => {
    closeMenu();
    if (!window.confirm(`Delete student record for ${name}? This action cannot be undone.`)) return;
    try {
      setActionLoading(studentId);
      try {
        const activeLocker = await api.lockers.getActiveForStudent(studentId);
        if (activeLocker) {
          const shouldRelease = window.confirm(
            `Notice: ${name} holds Locker ${activeLocker.label}.\n\n` +
            `Do you want to release the locker and refund any deposit?\n\n` +
            `Click OK to RELEASE Locker ${activeLocker.label}, or Cancel to keep it.`
          );
          if (shouldRelease) {
            await api.lockers.release(activeLocker.locker_id, { refund_deposit: true });
          }
        }
      } catch (lErr) {
        // ignore
      }

      await api.students.delete(studentId);
      toast.success(`Student record for ${name} deleted.`);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActionLoading('');
    }
  };

  return (
    <div>
      {/* Search & Filter Header */}
      <div className="card" style={{ marginBottom: 24, padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: '240px', maxWidth: '400px' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={16} color="var(--color-text-secondary)" style={{ position: 'absolute', left: 12, top: 12 }} />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: 36 }}
                placeholder="Search student by name, phone or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {['all', 'active', 'paused', 'expired', 'left'].map((st) => (
              <button
                key={st}
                className={`btn btn-sm ${statusFilter === st ? 'btn-primary' : 'btn-secondary'}`}
                style={{ textTransform: 'capitalize' }}
                onClick={() => setStatusFilter(st)}
              >
                {st}
              </button>
            ))}
            <button
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => setShowImportModal(true)}
            >
              <FileSpreadsheet size={15} color="var(--color-brand)" />
              <span>Import Students</span>
            </button>
            <button className="btn btn-primary btn-sm" onClick={onOpenNewStudent}>
              Register Student
            </button>
          </div>
        </div>
      </div>

      {/* Students Data Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
          <table className="data-table">
            <thead>
              <tr>
                <SortHeader field="full_name" currentField={sortField} direction={sortDirection} onSort={handleSort}>
                  Student
                </SortHeader>
                <SortHeader field="admission_number" currentField={sortField} direction={sortDirection} onSort={handleSort}>
                  Admission #
                </SortHeader>
                <th>Assigned Desk &amp; Shift</th>
                <SortHeader field="status" currentField={sortField} direction={sortDirection} onSort={handleSort}>
                  Status
                </SortHeader>
                <SortHeader field="expiry_date" currentField={sortField} direction={sortDirection} onSort={handleSort}>
                  Valid Until
                </SortHeader>
                <th>Preparation</th>
                <th style={{ textAlign: 'right', paddingRight: 20 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-secondary)' }}>
                    No students match the current filters.
                  </td>
                </tr>
              ) : (
                paginatedStudents.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--color-heading)' }}>{s.full_name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>{s.phone}</div>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-brand)', fontWeight: 600 }}>
                        {s.admission_number}
                      </span>
                    </td>
                    <td>
                      {s.current_desk_number ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div>
                            <span style={{ fontWeight: 700, color: 'var(--color-brand)', fontFamily: 'var(--font-mono)' }}>
                              Desk {s.current_desk_number}
                            </span>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{s.current_shift_name}</div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '3px 7px', fontSize: '0.75rem' }}
                            title="Change or Vacate Seat"
                            onClick={() => setSeatModalStudent(s)}
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          onClick={() => setSeatModalStudent(s)}
                        >
                          <Armchair size={13} color="var(--color-brand)" />
                          <span>+ Assign Seat</span>
                        </button>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-${s.status}`}>
                        {s.status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem', color: s.status === 'expired' ? 'var(--danger-text)' : 'var(--color-text)', fontWeight: 500 }}>
                        {formatDateDDMMYYYY(s.expiry_date)}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.notes || 'General Study'}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: 20 }}>
                      <button
                        type="button"
                        className={`btn-icon-more ${activeMenuStudent?.id === s.id ? 'active' : ''}`}
                        title="Actions"
                        aria-label="Actions"
                        disabled={actionLoading === s.id}
                        onClick={(e) => handleToggleMenu(e, s)}
                      >
                        <MoreVertical size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          currentPage={currentPage}
          totalItems={filteredStudents.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Floating Action Dropdown Menu (Rendered in Portal) */}
      {activeMenuStudent &&
        createPortal(
          <div
            ref={menuRef}
            className="actions-dropdown-menu"
            style={{
              top: menuPosition.top !== null ? `${menuPosition.top}px` : undefined,
              bottom: menuPosition.bottom !== null ? `${menuPosition.bottom}px` : undefined,
              right: `${menuPosition.right}px`,
            }}
          >
            {/* Communication Group */}
            <button
              type="button"
              className="actions-dropdown-item"
              onClick={() => handleCall(activeMenuStudent)}
            >
              <Phone size={15} color="#16A34A" />
              <span>Call</span>
            </button>
            <button
              type="button"
              className="actions-dropdown-item"
              onClick={() => handleSms(activeMenuStudent)}
            >
              <MessageSquare size={15} color="#2563EB" />
              <span>SMS</span>
            </button>
            <button
              type="button"
              className="actions-dropdown-item"
              onClick={() => handleWhatsApp(activeMenuStudent)}
            >
              <WhatsAppIcon size={16} color="#16A34A" />
              <span>WhatsApp</span>
            </button>

            <div className="actions-dropdown-divider" />

            {/* Management & Profile Actions */}
            <button
              type="button"
              className="actions-dropdown-item"
              onClick={() => {
                const target = activeMenuStudent;
                closeMenu();
                setDetailsModalStudent(target);
              }}
            >
              <Eye size={15} color="#475569" />
              <span>View details</span>
            </button>
            <button
              type="button"
              className="actions-dropdown-item"
              onClick={() => {
                const target = activeMenuStudent;
                closeMenu();
                setEditModalStudent(target);
              }}
            >
              <Edit size={15} color="#475569" />
              <span>Edit Student</span>
            </button>
            <button
              type="button"
              className="actions-dropdown-item"
              onClick={() => {
                const sid = activeMenuStudent.id;
                closeMenu();
                onOpenNewPayment(sid);
              }}
            >
              <CreditCard size={15} color="#4F46E5" />
              <span>Record Fee</span>
            </button>

            {activeMenuStudent.status === 'active' ? (
              <button
                type="button"
                className="actions-dropdown-item"
                onClick={() => handlePause(activeMenuStudent.id)}
              >
                <Pause size={15} color="#D97706" />
                <span>Pause Membership</span>
              </button>
            ) : activeMenuStudent.status === 'paused' ? (
              <button
                type="button"
                className="actions-dropdown-item"
                onClick={() => handleResume(activeMenuStudent.id)}
              >
                <Play size={15} color="#16A34A" />
                <span>Resume Membership</span>
              </button>
            ) : null}

            <div className="actions-dropdown-divider" />

            {/* Destructive Actions */}
            <button
              type="button"
              className="actions-dropdown-item danger"
              onClick={() => handleDelete(activeMenuStudent.id, activeMenuStudent.full_name)}
            >
              <Trash2 size={15} color="#DC2626" />
              <span>Delete student</span>
            </button>

            {activeMenuStudent.status !== 'left' && (
              <button
                type="button"
                className="actions-dropdown-item warning"
                onClick={() => handleMarkLeft(activeMenuStudent.id, activeMenuStudent.full_name)}
              >
                <UserX size={15} color="#EA580C" />
                <span>Mark as Left</span>
              </button>
            )}
          </div>,
          document.body
        )}

      {/* View Student Details Modal */}
      {detailsModalStudent && (
        <StudentDetailsModal
          student={detailsModalStudent}
          onClose={() => setDetailsModalStudent(null)}
          onEdit={(st) => {
            setDetailsModalStudent(null);
            setEditModalStudent(st);
          }}
          onRecordFee={(studentId) => {
            setDetailsModalStudent(null);
            onOpenNewPayment(studentId);
          }}
          onAssignSeat={(st) => {
            setDetailsModalStudent(null);
            setSeatModalStudent(st);
          }}
        />
      )}

      {/* Edit Student Details Modal */}
      {editModalStudent && (
        <EditStudentModal
          student={editModalStudent}
          onClose={() => setEditModalStudent(null)}
          onSuccess={() => {
            setEditModalStudent(null);
            onRefresh();
          }}
        />
      )}

      {/* Import Students Modal */}
      {showImportModal && (
        <ImportStudentsModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false);
            onRefresh();
          }}
        />
      )}

      {/* Student Seat Assign/Change Modal */}
      {seatModalStudent && (
        <StudentSeatModal
          student={seatModalStudent}
          onClose={() => setSeatModalStudent(null)}
          onSuccess={() => {
            setSeatModalStudent(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
