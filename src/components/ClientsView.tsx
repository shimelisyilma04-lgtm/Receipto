import React, { useState } from 'react';
import {
  Plus,
  Search,
  Users,
  Building,
  Mail,
  Phone,
  Edit2,
  Trash2,
  FileText,
  DollarSign,
  Sparkles,
} from 'lucide-react';
import type { Client, Invoice } from '../types.js';
import type { PlanTier } from '../plans.js';

interface ClientsViewProps {
  clients: Client[];
  invoices: Invoice[];
  loading: boolean;
  onOpenCreateClient: () => void;
  onOpenEditClient: (client: Client) => void;
  onDeleteClient: (id: string) => void;
  onSelectClientForInvoice: (clientId: string) => void;
  plan?: PlanTier;
  maxClients?: number | null;
  onPromptUpgrade?: (title: string, message: string, feature: string) => void;
}

export function ClientsView({
  clients,
  invoices,
  loading,
  onOpenCreateClient,
  onOpenEditClient,
  onDeleteClient,
  onSelectClientForInvoice,
  plan = 'FREE',
  maxClients = 3,
  onPromptUpgrade,
}: ClientsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Calculate client metrics (total invoices and total outstanding)
  const clientStats = clients.map((c) => {
    const clientInvoices = invoices.filter((i) => i.client_id === c.id);
    const outstanding = clientInvoices
      .filter((i) => i.payment_status === 'UNPAID' || i.payment_status === 'OVERDUE')
      .reduce((sum, i) => sum + i.amount, 0);
    const totalCount = clientInvoices.length;
    return {
      client: c,
      totalCount,
      outstanding,
    };
  });

  const filtered = clientStats.filter(({ client }) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      client.name.toLowerCase().includes(q) ||
      client.email.toLowerCase().includes(q) ||
      (client.company && client.company.toLowerCase().includes(q))
    );
  });

  const isAtLimit = maxClients !== null && clients.length >= maxClients;

  function handleAddClientClick() {
    if (isAtLimit) {
      onPromptUpgrade?.(
        'Client Capacity Reached',
        `You have reached the limit of ${maxClients} clients on the ${plan} plan. Upgrade to Starter for up to 25 clients, or Growth for unlimited clients.`,
        'clients'
      );
      return;
    }
    onOpenCreateClient();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Clients</h1>
          <p className="text-sm text-slate-500 mt-1">
            Maintain customer records, track billing accounts, and manage receivables.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {maxClients !== null && (
            <div className="text-xs text-slate-500 font-medium">
              <span className={isAtLimit ? 'font-bold text-rose-600' : 'text-slate-700'}>
                {clients.length} of {maxClients}
              </span>{' '}
              clients used ({plan})
            </div>
          )}
          <button
            id="btn-add-client-main"
            onClick={handleAddClientClick}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold transition shadow-xs ${
              isAtLimit ? 'bg-indigo-700 hover:bg-indigo-800' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isAtLimit ? <Sparkles className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{isAtLimit ? 'Add Client (Upgrade)' : 'Add Client'}</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between transition-colors">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            id="search-clients"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by client name, email, or company..."
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 hidden sm:block">
          Total: {clients.length} Client{clients.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Clients Grid / List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
        {loading ? (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500">Loading client registry...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center px-4">
            <Users className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">No clients found</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
              {searchQuery
                ? 'No matching clients found for your search.'
                : 'Add your first client to start issuing invoices and tracking payments.'}
            </p>
            {!searchQuery && (
              <button
                onClick={onOpenCreateClient}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Add Client</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map(({ client, totalCount, outstanding }) => (
              <div
                key={client.id}
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/60 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">{client.name}</h3>
                    {client.company && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                        <Building className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                        {client.company}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      {client.email}
                    </span>
                    {client.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {client.phone}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-6">
                  {/* Financial Balance */}
                  <div className="text-left sm:text-right">
                    <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">Outstanding</div>
                    <div className={`text-base font-bold ${outstanding > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      ${outstanding.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500">
                      {totalCount} invoice{totalCount === 1 ? '' : 's'} total
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onSelectClientForInvoice(client.id)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 transition"
                      title="Create Invoice for Client"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Invoice</span>
                    </button>
                    <button
                      onClick={() => onOpenEditClient(client)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 dark:hover:text-white transition"
                      title="Edit Client"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeleteClient(client.id)}
                      className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-500 transition"
                      title="Delete Client"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
