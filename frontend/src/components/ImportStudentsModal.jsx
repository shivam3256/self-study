import React, { useState, useRef } from 'react';
import {
  X,
  FileSpreadsheet,
  Download,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  ArrowRight,
  Search,
  Users,
  Check,
  Armchair,
  Info
} from 'lucide-react';
import { api } from '../api';
import useEscapeDismiss from '../hooks/useEscapeDismiss';

export default function ImportStudentsModal({ onClose, onSuccess }) {
  const [step, setStep] = useState('upload'); // 'upload' | 'preview' | 'importing' | 'success'
  useEscapeDismiss(() => {
    if (step !== 'importing') onClose();
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Validation state
  const [summaryData, setSummaryData] = useState(null);
  const [previewFilter, setPreviewFilter] = useState('all'); // 'all' | 'errors' | 'warnings' | 'valid'
  const [previewSearch, setPreviewSearch] = useState('');
  const [importResult, setImportResult] = useState(null);

  const fileInputRef = useRef(null);

  const handleDownloadTemplate = async () => {
    try {
      setError('');
      await api.students.downloadTemplate();
    } catch (err) {
      setError(err.message || 'Failed to download template.');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processFileSelection(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFileSelection(file);
    }
  };

  const processFileSelection = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      setError('Please select a valid Excel file (.xlsx or .xls).');
      return;
    }
    setSelectedFile(file);
    setError('');
  };

  const handleValidate = async () => {
    if (!selectedFile) {
      setError('Please select an Excel file to upload.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = await api.students.validateImport(selectedFile);
      setSummaryData(data);
      setStep('preview');
    } catch (err) {
      setError(err.message || 'Error validating Excel file.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!summaryData || !summaryData.rows || summaryData.rows.length === 0) return;

    // Filter valid rows
    const validRows = summaryData.rows.filter((r) => r.is_valid);
    if (validRows.length === 0) {
      setError('There are no valid student records to import. Please fix errors and re-upload.');
      return;
    }

    setStep('importing');
    setLoading(true);
    setError('');

    try {
      const res = await api.students.confirmImport(validRows);
      setImportResult(res);
      setStep('success');
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err.message || 'Failed to import students.');
      setStep('preview');
    } finally {
      setLoading(false);
    }
  };

  // Rows for preview table
  const filteredPreviewRows = (summaryData?.rows || []).filter((r) => {
    if (previewFilter === 'errors' && r.is_valid) return false;
    if (previewFilter === 'warnings' && (r.warnings.length === 0 || !r.is_valid)) return false;
    if (previewFilter === 'valid' && !r.is_valid) return false;

    if (previewSearch) {
      const q = previewSearch.toLowerCase();
      const matchName = r.name.toLowerCase().includes(q);
      const matchPhone = (r.phone || '').includes(q);
      const matchIdProof = (r.id_proof || '').toLowerCase().includes(q);
      const matchSeat = (r.seat || '').toLowerCase().includes(q);
      const matchEmail = (r.email || '').toLowerCase().includes(q);
      return matchName || matchPhone || matchIdProof || matchSeat || matchEmail;
    }
    return true;
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{
          maxWidth: step === 'preview' ? '960px' : '620px',
          transition: 'max-width 0.2s ease',
          width: '95vw',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            paddingBottom: 12,
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-brand-tint)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-brand)',
              }}
            >
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--color-heading)' }}>
                Import Students from Excel
              </h3>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                {step === 'upload' && 'Download template, prepare your student list, and upload for validation.'}
                {step === 'preview' && 'Review validation findings and confirm student directory import.'}
                {step === 'importing' && 'Importing student records and creating memberships...'}
                {step === 'success' && 'Students successfully imported into your study center.'}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={step === 'importing'}
            style={{ padding: '6px 8px' }}
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div
            style={{
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              color: 'var(--danger-text)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>{error}</div>
          </div>
        )}

        {/* STEP 1: Upload & Download Template */}
        {step === 'upload' && (
          <div>
            {/* Step 1.1 Download Action Banner */}
            <div
              style={{
                backgroundColor: 'var(--bg-alt)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 18px',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-heading)' }}>
                  Step 1: Download Official Excel Template
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  Includes exact columns: Name, Mob No., ID Proof Type, ID Proof, Email, Valid Upto, Seat, Status.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleDownloadTemplate}
                style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
              >
                <Download size={15} />
                <span>Download Template (.xlsx)</span>
              </button>
            </div>

            {/* Step 1.2 File Upload Dropzone */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-heading)', marginBottom: 8 }}>
                Step 2: Upload Completed Excel Sheet
              </div>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? 'var(--color-brand)' : selectedFile ? 'var(--success-solid)' : 'var(--color-input-border)'}`,
                  backgroundColor: isDragging ? 'var(--color-brand-tint)' : selectedFile ? 'var(--success-bg)' : '#FFFFFF',
                  borderRadius: 'var(--radius-lg)',
                  padding: '30px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx, .xls"
                  style={{ display: 'none' }}
                />

                {selectedFile ? (
                  <div>
                    <CheckCircle2 size={36} color="var(--success-solid)" style={{ margin: '0 auto 8px' }} />
                    <div style={{ fontWeight: 600, color: 'var(--color-heading)', fontSize: '0.95rem' }}>
                      {selectedFile.name}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                      {(selectedFile.size / 1024).toFixed(1)} KB • Click or drop to choose another file
                    </div>
                  </div>
                ) : (
                  <div>
                    <UploadCloud size={40} color="var(--color-brand)" style={{ margin: '0 auto 10px' }} />
                    <div style={{ fontWeight: 600, color: 'var(--color-heading)', fontSize: '0.95rem' }}>
                      Click to browse or drag and drop your Excel file here
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                      Supported format: Microsoft Excel (.xlsx, .xls) • Max size: 10MB
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Step 1.3 Key Rules & Guidelines */}
            <div
              style={{
                backgroundColor: 'var(--bg-alt)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
                fontSize: '0.82rem',
                color: 'var(--color-text-secondary)',
                marginBottom: 20,
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--color-heading)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Info size={14} color="var(--color-brand)" />
                <span>Import Guidelines:</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                <li><strong>Locked Example Row:</strong> Row 2 in the template contains sample data (Rahul Sharma) that is locked and automatically ignored during import. You can start typing student data from Row 3.</li>
                <li><strong>Name</strong> is the only mandatory column.</li>
                <li><strong>Mob No., Gender, ID Proof Type, ID Proof, Email, Notes</strong> are optional student registration details.</li>
                <li><strong>Gender:</strong> Male, Female, or Other.</li>
                <li><strong>Seat Assignment:</strong> Seats are assigned via the Billing or Seat Allocation screen after student registration.</li>
                <li>Do not modify or rearrange header column names.</li>
              </ul>
            </div>

            {/* Upload Step Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleValidate}
                disabled={!selectedFile || loading}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {loading ? 'Validating File...' : 'Upload & Validate Preview'}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Validation Preview */}
        {step === 'preview' && summaryData && (
          <div>
            {/* Metric Summary Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div
                className="card"
                style={{
                  padding: '12px 14px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Total Rows
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-heading)', marginTop: 2 }}>
                  {summaryData.total_rows}
                </div>
              </div>

              <div
                className="card"
                style={{
                  padding: '12px 14px',
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--success-text)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Valid Records
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--success-solid)', marginTop: 2 }}>
                  {summaryData.valid_rows}
                </div>
              </div>

              <div
                className="card"
                style={{
                  padding: '12px 14px',
                  backgroundColor: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--warning-text)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Warnings
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--warning-solid)', marginTop: 2 }}>
                  {summaryData.warning_rows}
                </div>
              </div>

              <div
                className="card"
                style={{
                  padding: '12px 14px',
                  backgroundColor: summaryData.error_rows > 0 ? '#FEF2F2' : '#F9FAFB',
                  border: `1px solid ${summaryData.error_rows > 0 ? '#FECACA' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: summaryData.error_rows > 0 ? 'var(--danger-text)' : 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Errors
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: summaryData.error_rows > 0 ? 'var(--danger-solid)' : 'var(--color-heading)', marginTop: 2 }}>
                  {summaryData.error_rows}
                </div>
              </div>
            </div>

            {/* Filtering & Search Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {[
                  { id: 'all', label: `All (${summaryData.total_rows})` },
                  { id: 'valid', label: `Valid (${summaryData.valid_rows})` },
                  { id: 'warnings', label: `Warnings (${summaryData.warning_rows})` },
                  { id: 'errors', label: `Errors (${summaryData.error_rows})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`btn btn-sm ${previewFilter === tab.id ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setPreviewFilter(tab.id)}
                    style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div style={{ position: 'relative', width: 220 }}>
                <Search size={14} color="var(--color-text-secondary)" style={{ position: 'absolute', left: 8, top: 9 }} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search in preview..."
                  style={{ paddingLeft: 28, paddingTop: 5, paddingBottom: 5, fontSize: '0.8rem' }}
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Preview Table */}
            <div
              style={{
                maxHeight: '320px',
                overflowY: 'auto',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 16,
              }}
            >
              <table className="data-table" style={{ fontSize: '0.82rem', margin: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: 45, textAlign: 'center' }}>Row</th>
                    <th style={{ width: 75 }}>Status</th>
                    <th>Student Name</th>
                    <th>Gender</th>
                    <th>Mob No.</th>
                    <th>ID Proof</th>
                    <th>Notes</th>
                    <th>Issues / Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPreviewRows.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-secondary)' }}>
                        No rows matching the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredPreviewRows.map((row) => (
                      <tr
                        key={row.row_number}
                        style={{
                          backgroundColor: !row.is_valid ? '#FEF2F2' : row.warnings.length > 0 ? '#FFFBEB' : 'inherit',
                        }}
                      >
                        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                          {row.row_number}
                        </td>
                        <td>
                          {row.is_valid ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                color: 'var(--success-solid)',
                                fontWeight: 600,
                                fontSize: '0.75rem',
                              }}
                            >
                              <CheckCircle2 size={13} /> Valid
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                color: 'var(--danger-solid)',
                                fontWeight: 600,
                                fontSize: '0.75rem',
                              }}
                            >
                              <XCircle size={13} /> Error
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--color-heading)' }}>{row.name}</div>
                          {row.email && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>{row.email}</div>
                          )}
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>
                          {row.gender || <span style={{ color: 'var(--color-text-muted)' }}>Other</span>}
                        </td>
                        <td>{row.phone || <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</td>
                        <td>
                          {row.id_proof ? (
                            <div>
                              <span style={{ fontWeight: 500 }}>{row.id_proof}</span>
                              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>{row.id_proof_type || 'Aadhaar'}</div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                          )}
                        </td>
                        <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.notes || <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                        </td>
                        <td>
                          {row.errors.length > 0 && (
                            <div style={{ color: 'var(--danger-text)', fontWeight: 500, fontSize: '0.75rem' }}>
                              {row.errors.map((e, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  • {e}
                                </div>
                              ))}
                            </div>
                          )}
                          {row.warnings.length > 0 && (
                            <div style={{ color: 'var(--warning-text)', fontSize: '0.75rem' }}>
                              {row.warnings.map((w, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  ⚠ {w}
                                </div>
                              ))}
                            </div>
                          )}
                          {row.errors.length === 0 && row.warnings.length === 0 && (
                            <span style={{ color: 'var(--success-text)', fontSize: '0.75rem' }}>Ready to import</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Error Blocking Alert */}
            {summaryData.error_rows > 0 && (
              <div
                style={{
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 14px',
                  fontSize: '0.82rem',
                  color: '#991B1B',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <strong>{summaryData.error_rows} row(s) contain errors</strong> that must be resolved, or you can import only the <strong>{summaryData.valid_rows} valid records</strong>.
                </div>
              </div>
            )}

            {/* Preview Step Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setStep('upload')}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <ArrowLeft size={15} />
                <span>Upload Different File</span>
              </button>

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleConfirmImport}
                  disabled={summaryData.valid_rows === 0 || loading}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Check size={16} />
                  <span>
                    Confirm & Import {summaryData.valid_rows} Student{summaryData.valid_rows === 1 ? '' : 's'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Importing Spinner */}
        {step === 'importing' && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div
              style={{
                width: 48,
                height: 48,
                border: '4px solid var(--color-border)',
                borderTopColor: 'var(--color-brand)',
                borderRadius: '50%',
                margin: '0 auto 16px',
                animation: 'spin 1s linear infinite',
              }}
            />
            <div style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--color-heading)' }}>
              Importing Student Directory...
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>
              Creating student records, generating admission IDs, and allocating seats.
            </div>
          </div>
        )}

        {/* STEP 4: Success Result */}
        {step === 'success' && importResult && (
          <div style={{ textAlign: 'center', padding: '20px 10px' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                backgroundColor: '#DCFCE7',
                color: 'var(--success-solid)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <CheckCircle2 size={32} />
            </div>

            <h3 style={{ fontSize: '1.25rem', color: 'var(--color-heading)', margin: '0 0 6px 0' }}>
              Import Completed Successfully!
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: '0 0 24px 0' }}>
              All valid student profiles have been saved to your center's directory.
            </p>

            {/* Results Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 16,
                maxWidth: 400,
                margin: '0 auto 24px',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  backgroundColor: 'var(--bg-alt)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 16px',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                  <Users size={14} color="var(--color-brand)" />
                  <span>Students Imported</span>
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-heading)', marginTop: 4 }}>
                  {importResult.imported_count}
                </div>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--bg-alt)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 16px',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                  <XCircle size={14} color="var(--color-text-muted)" />
                  <span>Skipped Records</span>
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-heading)', marginTop: 4 }}>
                  {importResult.skipped_count || 0}
                </div>
              </div>
            </div>

            {/* Action to Finish */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onClose}
                style={{ minWidth: 160 }}
              >
                View Students Directory
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
