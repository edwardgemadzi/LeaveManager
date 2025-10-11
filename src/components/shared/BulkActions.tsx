'use client';

import { useState } from 'react';

interface BulkActionsProps {
  selectedRequests: string[];
  onBulkAction: (action: 'approve' | 'reject', reason?: string) => Promise<void>;
  onClearSelection: () => void;
}

export default function BulkActions({ selectedRequests, onBulkAction, onClearSelection }: BulkActionsProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const handleBulkApprove = async () => {
    setIsProcessing(true);
    try {
      await onBulkAction('approve');
      onClearSelection();
    } catch (error) {
      console.error('Bulk approve error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkReject = async () => {
    setIsProcessing(true);
    try {
      await onBulkAction('reject', rejectReason);
      setShowRejectModal(false);
      setRejectReason('');
      onClearSelection();
    } catch (error) {
      console.error('Bulk reject error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  if (selectedRequests.length === 0) {
    return null;
  }

  return (
    <>
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-4 flex items-center space-x-4">
          <div className="text-sm font-medium text-gray-700">
            {selectedRequests.length} request{selectedRequests.length > 1 ? 's' : ''} selected
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={handleBulkApprove}
              disabled={isProcessing}
              className="btn-success text-sm py-2 px-4 disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : '✅ Approve All'}
            </button>
            
            <button
              onClick={() => setShowRejectModal(true)}
              disabled={isProcessing}
              className="btn-danger text-sm py-2 px-4 disabled:opacity-50"
            >
              ❌ Reject All
            </button>
            
            <button
              onClick={onClearSelection}
              disabled={isProcessing}
              className="btn-secondary text-sm py-2 px-4"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Reject Reason Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Reject Leave Requests
            </h3>
            
            <div className="mb-4">
              <label htmlFor="rejectReason" className="block text-sm font-medium text-gray-700 mb-2">
                Reason for rejection (optional)
              </label>
              <textarea
                id="rejectReason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="input-modern"
                rows={3}
                placeholder="Enter reason for rejection..."
              />
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={handleBulkReject}
                disabled={isProcessing}
                className="btn-danger flex-1"
              >
                {isProcessing ? 'Rejecting...' : 'Reject All'}
              </button>
              
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason('');
                }}
                disabled={isProcessing}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
