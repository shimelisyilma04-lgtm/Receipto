import React from 'react';
import { X } from 'lucide-react';
import { ReceiptoLogo } from './ReceiptoLogo.js';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TermsModal({ isOpen, onClose }: TermsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <ReceiptoLogo size="sm" />
            <div>
              <h2 className="text-base font-bold text-white">Receipto Terms & Privacy</h2>
              <p className="text-xs text-slate-400">Last updated September 2026</p>
            </div>
          </div>
          <button
            id="btn-close-terms"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300 leading-relaxed font-sans">
          <section>
            <h3 className="text-sm font-semibold text-white mb-1.5">1. Acceptance of Terms</h3>
            <p>
              By registering for, accessing, or using Receipto, you agree to be bound by these Terms
              of Service and Privacy Policy. If you do not agree to all terms, you may not access or use the service.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-white mb-1.5">2. Account Registration & Email Verification</h3>
            <p>
              To access the Service, you must provide valid, accurate, and complete registration information,
              including your full name and a verifiable email address. You must verify ownership of your email
              address using the secure one-time verification code before account activation. You are responsible
              for maintaining the confidentiality of your credentials.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-white mb-1.5">3. Acceptable Use</h3>
            <p>
              You agree to use Receipto solely for lawful business invoicing, billing management, and client communication.
              You must not:
            </p>
            <ul className="list-disc pl-5 mt-1 space-y-1 text-slate-400">
              <li>Send unsolicited, spam, fraudulent, or deceptive invoices or payment reminders.</li>
              <li>Impersonate any other person, entity, or financial institution.</li>
              <li>Attempt to bypass rate limits, authentication controls, or cryptographic safeguards.</li>
              <li>Use the service to transmit malware, viruses, or harmful payloads.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-white mb-1.5">4. Payment Terms & Invoicing Data</h3>
            <p>
              Receipto provides record-keeping, tracking, and reminder delivery for invoices generated
              by users. You retain full ownership of client and transaction records. Receipto does not
              act as a banking institution or escrow agent and is not liable for unpaid or disputed invoices
              between you and your clients.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-white mb-1.5">5. Data Privacy & Security</h3>
            <p>
              We prioritize data privacy and confidentiality. Your personal information, password hashes,
              and client records are stored securely with industry-standard cryptographic protection. We do not
              sell or rent your personal or financial data to third-party advertisers. Transactional emails
              and verification codes are dispatched strictly to facilitate service delivery.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-white mb-1.5">6. Limitation of Liability</h3>
            <p>
              To the maximum extent permitted by applicable law, Receipto and its contributors shall not
              be liable for any indirect, incidental, punitive, or consequential damages, including loss of
              profits, data, or goodwill arising from the use or inability to use the service.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-white mb-1.5">7. Modifications & Termination</h3>
            <p>
              We reserve the right to modify these terms upon notice. You may terminate your account at any
              time through the application settings, which will permanently purge your account records.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex justify-end">
          <button
            id="btn-agree-terms-close"
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition"
          >
            I Understand & Close
          </button>
        </div>
      </div>
    </div>
  );
}
