import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  X,
  UserCheck,
  LogOut,
  AlertTriangle,
  History,
  CornerDownLeft,
  Receipt,
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

function getShortcutLabel() {
  if (typeof navigator !== 'undefined') {
    const isMac = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent);
    return isMac ? '⌘ K' : 'Ctrl K';
  }
  return 'Ctrl K';
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function GlobalSearchModal({
  isOpen,
  onClose,
  triggerRef,
  tenant,
  onOpenPayment,
  onSelectStudent,
  onRefreshData,
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [recentStudents, setRecentStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const inputRef = useRef(null);
  const modalRef = useRef(null);
  const abortControllerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  const recentStorageKey = `apex_search_recent_${tenant?.id || 'default'}`;

  // Load recent students from localStorage
  const loadRecentStudents = useCallback(() => {
    try {
      const stored = localStorage.getItem(recentStorageKey);
      if (stored) {
        setRecentStudents(JSON.parse(stored).slice(0, 5));
      } else {
        setRecentStudents([]);
      }
    } catch {
      setRecentStudents([]);
    }
  }, [recentStorageKey]);

  // Save student to recents
  const saveToRecent = useCallback(
    (student) => {
      try {
        const stored = localStorage.getItem(recentStorageKey);
        const list = stored ? JSON.parse(stored) : [];
        const filtered = list.filter((s) => s.id !== student.id);
        const updated = [
          {
            id: student.id,
            admission_number: student.admission_number,
            full_name: student.full_name,
            phone: student.phone,
            status: student.status,
            expiry_date: student.expiry_date,
            assigned_desk: student.assigned_desk,
            assigned_shift: student.assigned_shift,
            currently_inside: student.currently_inside,
            days_overdue: student.days_overdue,
          },
          ...filtered,
        ].slice(0, 5);
        localStorage.setItem(recentStorageKey, JSON.stringify(updated));
        setRecentStudents(updated);
      } catch (err) {
        console.warn('Failed to save recent student:', err);
      }
    },
    [recentStorageKey]
  );

  // Initialize and focus on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setError(null);
      setActiveIndex(0);
      loadRecentStudents();
      setTimeout(() => {
        inputRef.current?.focus();
      }, 30);
    } else {
      // Abort in-flight requests on close
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
  }, [isOpen, loadRecentStudents]);

  // Focus trap inside modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        triggerRef?.current?.focus?.();
        return;
      }

      if (e.key === 'Tab') {
        const focusable = modalRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, triggerRef]);

  // Execute search with debounce and AbortController
  const performSearch = useCallback(
    async (searchTerm) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const trimmed = searchTerm.trim();
      if (trimmed.length < 2) {
        setResults([]);
        setLoading(false);
        setError(null);
        return;
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const data = await api.students.search(trimmed, {
          signal: controller.signal,
          limit: 8,
        });
        setResults(data || []);
        setActiveIndex(0);
      } catch (err) {
        if (err.name === 'AbortError' || controller.signal.aborted) {
          return; // Ignore aborted requests
        }
        console.error('Search error:', err);
        setError('Failed to search students. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      performSearch(val);
    }, 250);
  };

  const displayedList = query.trim().length >= 2 ? results : recentStudents;
  const isViewingRecents = query.trim().length < 2;

  // Keyboard navigation through search results
  const handleInputKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (displayedList.length > 0) {
        setActiveIndex((prev) => (prev + 1) % displayedList.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (displayedList.length > 0) {
        setActiveIndex((prev) => (prev - 1 + displayedList.length) % displayedList.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (displayedList[activeIndex]) {
        handleRowClick(displayedList[activeIndex]);
      }
    }
  };

  const handleRowClick = (student) => {
    saveToRecent(student);
    onClose();
    if (onSelectStudent) {
      onSelectStudent(student.id);
    }
  };

  const handleCollectFee = (e, student) => {
    e.stopPropagation();
    saveToRecent(student);
    onClose();
    if (onOpenPayment) {
      onOpenPayment(student.id);
    }
  };

  const handleToggleCheckIn = async (e, student) => {
    e.stopPropagation();
    setActionLoadingId(student.id);
    try {
      if (student.currently_inside) {
        // Check out
        await api.attendance.checkOut(student.id);
        toast.success(`${student.full_name} checked out.`);
        // Update local state
        setResults((prev) =>
          prev.map((s) => (s.id === student.id ? { ...s, currently_inside: false } : s))
        );
        setRecentStudents((prev) =>
          prev.map((s) => (s.id === student.id ? { ...s, currently_inside: false } : s))
        );
      } else {
        // Check in
        await api.attendance.checkIn({
          student_id: student.id,
          method: 'manual',
        });
        toast.success(`${student.full_name} checked in successfully!`);
        setResults((prev) =>
          prev.map((s) => (s.id === student.id ? { ...s, currently_inside: true } : s))
        );
        setRecentStudents((prev) =>
          prev.map((s) => (s.id === student.id ? { ...s, currently_inside: true } : s))
        );
      }
      if (onRefreshData) {
        onRefreshData();
      }
    } catch (err) {
      toast.error(err.message || 'Check-in action failed.');
    } finally {
      setActionLoadingId(null);
    }
  };

  if (!isOpen) return null;

  const shortcutHint = getShortcutLabel();

  return (
    <div
      className="global-search-backdrop"
      onClick={() => {
        onClose();
        triggerRef?.current?.focus?.();
      }}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="global-search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Search students"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="search-modal-header">
          <Search size={18} className="search-modal-icon" />
          <input
            ref={inputRef}
            type="text"
            className="search-modal-input"
            placeholder="Search students by name, phone or ID (ADM-0033)..."
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            role="combobox"
            aria-expanded={displayedList.length > 0}
            aria-autocomplete="list"
            aria-controls="search-results-listbox"
            aria-activedescendant={
              displayedList[activeIndex] ? `search-opt-${displayedList[activeIndex].id}` : undefined
            }
          />
          <div className="search-modal-hints">
            <span className="kbd-shortcut-hint">{shortcutHint}</span>
            <button
              type="button"
              className="search-modal-close-btn"
              onClick={() => {
                onClose();
                triggerRef?.current?.focus?.();
              }}
              aria-label="Close search"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Content Body */}
        <div className="search-modal-body" id="search-results-listbox" role="listbox">
          {/* Loading Skeleton */}
          {loading && (
            <div className="search-skeleton-container" aria-label="Searching…">
              {[1, 2, 3].map((i) => (
                <div key={i} className="search-skeleton-row">
                  <div className="skeleton-avatar" />
                  <div className="skeleton-lines">
                    <div className="skeleton-line long" />
                    <div className="skeleton-line short" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error Message */}
          {!loading && error && (
            <div className="search-error-state">
              <AlertTriangle size={20} color="var(--danger-solid)" />
              <span>{error}</span>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => performSearch(query)}
              >
                Retry
              </button>
            </div>
          )}

          {/* Recents header when before typing */}
          {!loading && !error && isViewingRecents && recentStudents.length > 0 && (
            <div className="search-section-header">
              <History size={13} />
              <span>Recently Opened Students</span>
            </div>
          )}

          {/* Empty State before typing without recents */}
          {!loading && !error && isViewingRecents && recentStudents.length === 0 && (
            <div className="search-empty-prompt">
              <Search size={24} style={{ opacity: 0.35, marginBottom: 8 }} />
              <div>Type at least 2 characters to search students by name, phone or admission ID.</div>
            </div>
          )}

          {/* No results state */}
          {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
            <div className="search-no-results">
              <div className="no-results-icon">
                <Search size={22} />
              </div>
              <div className="no-results-title">
                No students found matching "{query}"
              </div>
              <div className="no-results-subtitle">
                Check the spelling or try searching by phone number or admission ID.
              </div>
            </div>
          )}

          {/* Results List */}
          {!loading && !error && displayedList.length > 0 && (
            <div className="search-results-list">
              {displayedList.map((s, idx) => {
                const isSelected = idx === activeIndex;
                const isActionLoading = actionLoadingId === s.id;

                return (
                  <div
                    key={s.id}
                    id={`search-opt-${s.id}`}
                    role="option"
                    aria-selected={isSelected}
                    className={`search-result-row ${isSelected ? 'active' : ''}`}
                    onClick={() => handleRowClick(s)}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    {/* Left: Info */}
                    <div className="search-result-info">
                      <div className="search-student-title-line">
                        <span className="search-student-name">{s.full_name}</span>
                        <span className="search-student-adm">#{s.admission_number}</span>

                        {/* Status Badge */}
                        <span className={`badge badge-${s.status}`}>
                          <span className={`badge-dot ${s.status === 'active' ? 'pulse' : ''}`} />
                          <span>{s.status}</span>
                        </span>

                        {/* Overdue Badge */}
                        {s.days_overdue && s.days_overdue > 0 ? (
                          <span className="badge badge-paused">
                            overdue by {s.days_overdue} {s.days_overdue === 1 ? 'day' : 'days'}
                          </span>
                        ) : null}

                        {/* Currently Inside Indicator */}
                        {s.currently_inside && (
                          <span className="inside-pill">
                            <span className="inside-pill-dot" />
                            <span>Inside</span>
                          </span>
                        )}
                      </div>

                      <div className="search-student-meta-line">
                        <span>{s.phone}</span>
                        {(s.assigned_desk || s.assigned_shift) && (
                          <>
                            <span className="meta-bullet">•</span>
                            <span>
                              {s.assigned_desk ? `Desk ${s.assigned_desk}` : 'No seat'}
                              {s.assigned_shift ? ` (${s.assigned_shift})` : ''}
                            </span>
                          </>
                        )}
                        {s.expiry_date && (
                          <>
                            <span className="meta-bullet">•</span>
                            <span>Valid until {formatDate(s.expiry_date)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right: Quick Actions */}
                    <div className="search-quick-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary search-action-btn"
                        onClick={(e) => handleCollectFee(e, s)}
                        title="Collect fee for this student"
                      >
                        <Receipt size={13} />
                        <span>Collect fee</span>
                      </button>

                      <button
                        type="button"
                        className={`btn btn-sm ${
                          s.currently_inside ? 'btn-secondary' : 'btn-primary'
                        } search-action-btn`}
                        onClick={(e) => handleToggleCheckIn(e, s)}
                        disabled={isActionLoading}
                        title={s.currently_inside ? 'Record check-out' : 'Record check-in'}
                      >
                        {s.currently_inside ? <LogOut size={13} /> : <UserCheck size={13} />}
                        <span>
                          {isActionLoading
                            ? 'Updating…'
                            : s.currently_inside
                            ? 'Check out'
                            : 'Check-in'}
                        </span>
                      </button>

                      <div className="search-enter-hint" title="Press Enter to open student profile">
                        <CornerDownLeft size={12} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer Key Hints */}
        <div className="search-modal-footer">
          <div className="search-footer-hint">
            <span className="kbd-mini">↑</span>
            <span className="kbd-mini">↓</span>
            <span>Navigate</span>
          </div>
          <div className="search-footer-hint">
            <span className="kbd-mini">Enter</span>
            <span>Open Profile</span>
          </div>
          <div className="search-footer-hint">
            <span className="kbd-mini">Tab</span>
            <span>Actions</span>
          </div>
          <div className="search-footer-hint">
            <span className="kbd-mini">Esc</span>
            <span>Close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
