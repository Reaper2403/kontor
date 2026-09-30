import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown, ChevronRight, CircleCheck, Clock3, Copy, Download, ExternalLink, FileText, FlaskConical, Layers3, LoaderCircle, LockKeyhole, Plus, RotateCcw, ShieldCheck, X } from 'lucide-react';
import type { Action, Actor, ApiError, Evidence, State } from '../contracts/api';

const money = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
const date = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const time = (value: string) => new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const short = (value: string) => value.length > 22 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value;

function Modal({ title, children, onClose, error }: { title: string; children: ReactNode; onClose: () => void; error?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => { if (dialog.open) dialog.close(); }; }, []);
  return <dialog ref={ref} onCancel={onClose} onClick={e => { if (e.target === ref.current) onClose(); }} aria-labelledby="dialog-title">
    <div className="modal-head"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>{error && <div className="message error" role="alert">{error}</div>}{children}
  </dialog>;
}

function Status({ state, pending = false }: { state: State; pending?: boolean }) {
  if (state.status !== 'paid' && (pending || state.operation)) return <span className="status waiting"><Clock3 size={13} />{state.operation?.status === 'unknown' ? 'Confirmation needed' : 'Updating payable'}</span>;
  return <span className={`status ${state.status === 'paid' ? 'success' : state.status === 'approved' ? 'ready' : 'waiting'}`}>
    {state.status === 'paid' ? <CheckCheck size={13} /> : state.status === 'approved' ? <CircleCheck size={13} /> : <Clock3 size={13} />}
    {state.status === 'paid' ? 'Paid' : state.status === 'approved' ? 'Ready to pay' : state.credit ? 'New approvals needed' : 'Needs approval'}
  </span>;
}

export interface TourPresentation {
  state: State;
  initialPage?: 'inbox' | 'detail';
  initialTab?: 'overview' | 'evidence';
  initialModal?: 'pay';
  actor?: Actor;
  evidenceHref: string;
  onShowRecordedPayment?: () => void;
}

// Tour rendering is explicit and read-only. Remount with a scene key to change snapshots.
export default function App({ tour }: { tour?: TourPresentation } = {}) {
  const [state, setState] = useState<State | null>(tour?.state ?? null);
  const [page, setPage] = useState<'inbox' | 'detail'>(tour?.initialPage ?? 'inbox');
  const [tab, setTab] = useState<'overview' | 'evidence'>(tour?.initialTab ?? 'overview');
  const [actor, setActor] = useState<Actor>(tour?.actor ?? 'reviewer');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkFeedback, setCheckFeedback] = useState<{ message: string; at: string } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<'credit' | 'pay' | 'reset' | null>(tour?.initialModal ?? null);
  const [creditAmount, setCreditAmount] = useState('200');
  const [creditReference, setCreditReference] = useState('CN-2026-084');
  const [creditReason, setCreditReason] = useState('Service adjustment agreed with supplier');
  const [controlsOpen, setControlsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const actionLock = useRef(false);

  async function refresh() {
    if (tour) return;
    try { const response = await fetch('/api/state'); if (!response.ok) throw new Error('The workspace could not be loaded. Please try again.'); setState(await response.json()); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Connection unavailable.'); }
  }
  useEffect(() => { if (!tour) void refresh(); }, []);
  async function act(type: Action['type'], extra: Partial<Action> = {}) {
    if (tour || !state || actionLock.current) return false;
    actionLock.current = true; setBusy(true); setError(''); setNotice(''); setCheckFeedback(null);
    try {
      const response = await fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, actor, expectedRevision: state.revision, idempotencyKey: crypto.randomUUID(), ...extra }) });
      const result: State | ApiError = await response.json();
      if ('error' in result) { setState(result.state); if (result.state.operation) { setError(''); setModal(null); } else setError(result.error.message); return false; }
      setState(result);
      setNotice(type === 'approve' ? `Approval recorded for ${money(result.amountDue)} Test USD.` : type === 'apply-credit' ? 'Credit applied. The revised amount needs two new approvals.' : type === 'test-previous' ? 'Previous payment attempt checked. View the recorded result below.' : type === 'capture-previous' ? 'The approved payment is saved for the control check.' : type === 'pay' ? 'Payment recorded. The evidence is ready to review.' : 'A fresh demonstration is ready.');
      return true;
    } catch { setError('The response could not be confirmed. Refresh the workspace before trying again.'); return false; }
    finally { actionLock.current = false; setBusy(false); }
  }
  async function reconcile() {
    if (tour || !state?.operation || state.operation.type !== 'approve' || !state.operation.recoverySupported || actionLock.current) return;
    actionLock.current = true; setChecking(true); setError(''); setNotice(''); setCheckFeedback(null);
    try {
      const response = await fetch('/api/reconcile', { method: 'POST' });
      const result: State | ApiError = await response.json();
      const nextState = 'error' in result ? result.state : result;
      setState(nextState);
      if ('error' in result) {
        setCheckFeedback({ message: nextState.operation?.lastCheckMessage ?? 'Confirmation was not established. The payable remains locked; operator assistance may be needed.', at: new Date().toISOString() });
      } else if (nextState.operation) {
        setCheckFeedback({ message: nextState.operation.lastCheckMessage ?? 'Confirmation was not established. The payable remains locked. Check again when the network is available.', at: nextState.operation.lastCheckedAt ?? new Date().toISOString() });
      } else {
        setNotice('The submitted approval is confirmed and recorded. It was not submitted again.');
        setCheckFeedback(null);
      }
    } catch {
      setCheckFeedback({ message: 'The status check could not be completed. The payable remains locked. Check again when the network is available.', at: new Date().toISOString() });
    } finally { actionLock.current = false; setChecking(false); }
  }
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setNotice('Copied to clipboard.'); } catch { setError('Clipboard unavailable. You can select and copy the identifier directly.'); } }

  if (!state) return <div className="loading-screen"><div className="brand">kontor<span>↗</span></div>{error ? <><p role="alert">{error}</p><button className="button primary" onClick={refresh}>Try again</button></> : <><LoaderCircle className="spin" size={24} /><p>Opening your workspace…</p></>}</div>;

  const person = state.people.find(p => p.id === actor);
  const requiredApproverIds: Actor[] = ['approver-a', 'approver-b'];
  const currentApprovals = requiredApproverIds.flatMap(id => {
    const approval = state.approvals.find(a => a.actor === id && a.current && a.revision === state.revision);
    return approval ? [approval] : [];
  });
  const expired = state.approvals.filter(a => !a.current || a.revision !== state.revision);
  const approvedByMe = currentApprovals.some(a => a.actor === actor);
  const isApprover = actor === 'approver-a' || actor === 'approver-b';
  const canApprove = isApprover && !approvedByMe && state.status !== 'paid';
  const paid = state.status === 'paid';
  const blocked = state.evidence.findLast(e => e.kind === 'blocked');
  const pending = busy || checking || Boolean(state.operation);
  const operation = state.operation;
  const operationNames: Record<string, string> = { approve: 'Approval', 'apply-credit': 'Supplier credit', pay: 'Payment', reset: 'Workspace reset', 'capture-previous': 'Saved instruction', 'test-previous': 'Previous approval check' };
  const operationName = operation ? operationNames[operation.type] ?? 'Operation' : 'Operation';
  const operationPerson = state.people.find(p => p.id === operation?.actor);
  const operationAmount = typeof operation?.amount === 'number' ? `${money(operation.amount)} Test USD` : null;
  const operationSubject = `${operationPerson ? `${operationPerson.name}'s ` : ''}${operationName.toLowerCase()}${operationAmount ? ` of ${operationAmount}` : ''}`;
  const operationSummary = operation ? `${operationSubject.charAt(0).toUpperCase()}${operationSubject.slice(1)} is ${operation.status === 'unknown' ? 'awaiting confirmation' : 'being confirmed'}.` : '';
  const canReconcile = operation?.type === 'approve' && operation.recoverySupported === true;
  const operationHelp = canReconcile
    ? 'Check status to verify the approval already submitted. This check will not submit it again.'
    : 'Operator assistance is required to resolve this operation. Refresh can retrieve updated state, but cannot automatically recover it.';
  const operationFunds = operation?.type === 'approve' ? 'An approval does not transfer Test USD.'
    : operation?.type === 'pay' ? 'The payment outcome is not confirmed. Do not submit another payment.'
    : 'The result is not confirmed. Do not repeat this operation.';
  const safeOperationText = (text: string) => operation?.signature ? text.split(operation.signature).join('the recorded transaction') : text;
  const lastCheckMessage = checkFeedback?.message ?? operation?.lastCheckMessage;
  const lastCheckedAt = checkFeedback?.at ?? operation?.lastCheckedAt;
  const approvalsComplete = currentApprovals.length === requiredApproverIds.length;
  const readyToPay = approvalsComplete && state.status === 'approved' && !pending;
  const reviewer = state.people.find(p => p.id === 'reviewer');
  const executor = state.people.find(p => p.id === 'executor');
  const remainingApprovers = requiredApproverIds.filter(id => !currentApprovals.some(a => a.actor === id));
  const remainingNames = remainingApprovers.map(id => state.people.find(p => p.id === id)?.name ?? id).join(' and ');
  const executorLabel = executor ? `${executor.name} · ${executor.role}` : 'the payment operator';
  const reviewerLabel = reviewer ? `${reviewer.name} · ${reviewer.role}` : 'the finance reviewer';
  const approvalSummary = pending ? operation?.status === 'unknown' ? `${operationName} needs confirmation` : 'Updating payable…'
    : approvalsComplete ? 'Both approvals are recorded'
    : `${remainingApprovers.length === 1 ? 'One approval' : 'Two approvals'} still needed`;
  const nextStep = pending ? operation ? `${operationSummary} ${operationFunds}` : 'Wait for the update to finish.'
    : readyToPay ? actor === 'executor' ? `Both approvals are in. Ready to pay as ${person?.name ?? executorLabel}.` : `Switch demo role to ${executorLabel} to pay.`
    : approvalsComplete ? 'Approvals are recorded. Refresh to confirm payment readiness.'
    : canApprove ? `Review and approve as ${person?.name ?? actor}. ${remainingApprovers.length} ${remainingApprovers.length === 1 ? 'approval remains' : 'approvals remain'}.`
    : `Still to approve: ${remainingNames}. Switch demo role to continue.`;
  const creditEvents = state.evidence.filter(e => e.kind === 'credit');
  const linkedCredit = creditEvents.length === 1 && state.creditNote
    && creditEvents[0].detail.startsWith(`${state.creditNote.reference}:`)
    && creditEvents[0].revision <= state.revision ? creditEvents[0] : null;
  const expiredApprovalCredit = (event: Evidence) => event.kind === 'approval' && linkedCredit
    && event.revision + 1 === linkedCredit.revision
    && new Date(event.at).getTime() <= new Date(linkedCredit.at).getTime() ? state.creditNote : null;
  const approvalAnnotation = (event: Evidence) => {
    if (event.kind !== 'approval') return null;
    const credit = expiredApprovalCredit(event);
    return `Invoice version ${event.revision}${credit ? ` · Expired after ${credit.reference}` : event.revision === state.revision ? ' · Current approval version' : ''}`;
  };
  const evidenceDescription = (event: Evidence) => {
    const credit = expiredApprovalCredit(event);
    if (!credit || typeof event.amount !== 'number' || !Number.isFinite(event.amount)) return event.detail;
    return `Approved ${money(event.amount)} Test USD for invoice version ${event.revision}; superseded by credit ${credit.reference}.`;
  };
  const listAmount = paid ? state.settlement?.amount ?? state.amountDue : state.amountDue;
  const openDetail = () => { setPage('detail'); setTab('overview'); };
  const showInvoice = filter === 'all' || (filter === 'paid' ? paid : !paid);
  const environment = tour ? 'Recorded devnet · Static replay' : state.mode === 'devnet' ? 'Solana devnet · Test funds' : 'Rehearsal · No on-chain transaction';

  const approvalPanel = <aside className="approval-panel">
    <div className="rail-label"><span>PAYMENT REVIEW</span><ShieldCheck size={17} /></div>
    <div className="amount-label">{paid ? 'Amount paid' : 'Amount due'}</div>
    <div className="big-amount">{money(paid ? state.settlement?.amount ?? state.amountDue : state.amountDue)}<span>Test USD</span></div>
    <Status state={state} pending={pending} />
    <div className="breakdown"><div><span>Invoice total</span><b>{money(state.amountOriginal)}</b></div><div className={state.credit ? 'credit-text' : ''}><span>Credits applied</span><b>{state.credit ? '−' : ''}{money(state.credit)}</b></div><div className="total"><span>{paid ? 'Settled amount' : 'Payable amount'}</span><b>{money(state.amountDue)} <small>Test USD</small></b></div></div>
    {state.credit > 0 && !paid && <div className="change-note"><ArrowDownLeft size={17} /><p>{pending ? "Confirming payable state." : readyToPay ? "Ready for payment." : approvalsComplete ? "Confirm payment readiness." : "Amount changed after review."}<br /><strong>{pending ? operation ? `${operationName} confirmation is pending. See recovery details above.` : "Wait for the update to finish." : approvalsComplete ? `Revised ${money(state.amountDue)} Test USD approved.` : `${remainingApprovers.length} ${remainingApprovers.length === 1 ? "approval remains" : "approvals remain"} for ${money(state.amountDue)} Test USD.`}</strong></p></div>}
    <div className="section-line"><h3>Approval route</h3><span>{currentApprovals.length} of 2</span></div>
    <div className="approval-people">{state.people.filter(p => p.id === 'approver-a' || p.id === 'approver-b').map(p => { const approval = currentApprovals.find(a => a.actor === p.id); return <div className="approver" key={p.id}><div className={`avatar ${approval ? 'approved' : ''}`}>{approval ? <Check size={17} /> : p.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</div><div><strong>{p.name}</strong><span>{p.role}</span></div><span className={approval ? 'approval-done' : 'approval-pending'}>{approval ? 'Approved' : 'Pending'}</span></div>; })}</div>
    {expired.length > 0 && <details className="expired" open={tour ? true : undefined}><summary>{expired.length} earlier approvals expired<ChevronDown size={14} /></summary><p>They covered an earlier amount and cannot authorize this payment.</p>{expired.map((a, i) => <div key={`${a.actor}-${i}`}>{a.name}<span>{money(a.amount)} Test USD</span></div>)}</details>}
    <div className="rail-action">
      {tour ? <><div className={paid ? 'paid-summary' : 'waiting-message'}><ShieldCheck size={18} /><span>{paid ? 'Recorded payment confirmed' : approvalSummary}</span></div><p className="action-help">Historical snapshot · No transaction is sent.</p>{tour.initialModal === 'pay' && <button className="button secondary wide" onClick={() => setModal('pay')}>Inspect recorded payment review</button>}{paid && <button className="button primary wide" onClick={() => setTab('evidence')}>View recorded evidence<ArrowRight size={16} /></button>}</> : paid ? <><div className="paid-summary"><CircleCheck size={20} /><span>{state.mode === 'rehearsal' ? 'Rehearsal payment recorded' : 'Payment confirmed'}</span></div><button className="button primary wide" onClick={() => setTab('evidence')}>View payment evidence<ArrowRight size={16} /></button></> : <>
        {canApprove ? <button disabled={pending} className="button primary wide" onClick={() => act('approve')}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Approve {money(state.amountDue)} Test USD</button> : actor === 'executor' ? <button className="button primary wide" disabled={pending || state.status !== 'approved'} onClick={() => { setError(''); setModal('pay'); }}><ArrowRight size={16} />Pay {money(state.amountDue)} Test USD</button> : <div className="waiting-message"><LockKeyhole size={15} />{approvalSummary}</div>}
        <p className="action-help">{nextStep}</p>
        {!state.creditNote && <><button className="button secondary wide" disabled={pending || actor !== 'reviewer'} aria-describedby={actor !== 'reviewer' ? "credit-role-hint" : undefined} onClick={() => { setError(''); setModal('credit'); }}><Plus size={16} />Apply supplier credit</button>{actor !== 'reviewer' && <p id="credit-role-hint" className="credit-role-hint">To apply a credit, switch demo role to {reviewerLabel}.</p>}</>}
      </>}
    </div>
    <div className="rail-foot"><LockKeyhole size={12} /><span>Only the currently approved amount can be paid.</span></div>
  </aside>;

  return <div className="app-shell">
    <aside className="sidebar"><button className="brand brand-button" onClick={() => setPage('inbox')} aria-label="Kontor payables">kontor<span>↗</span></button><div className="workspace-label"><span className="workspace-symbol">N</span><div>Northstar Studio<small>Finance workspace</small></div></div><div className="nav-label">WORKSPACE</div><nav><button className="nav-item active" onClick={() => setPage('inbox')}><Layers3 size={18} />Payables<span className="nav-count">1</span></button></nav><div className="sidebar-note"><div className="fine-rule" /><span className="sidebar-eyebrow">LESS CHASING.<br />MORE CERTAINTY.</span><p>Every payment starts<br />with a clear agreement.</p></div><div className="demo-role">{tour ? <><span className="eyebrow">RECORDED ACTOR</span><p><strong>{person?.name}</strong><br />{person?.role}</p><p>Read-only historical replay.</p></> : <><label htmlFor="actor"><FlaskConical size={14} />Demo role</label><select id="actor" value={actor} disabled={pending} onChange={e => { setActor(e.target.value as Actor); setNotice(''); }}>{state.people.map(p => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select><p>Switch people to walk through the approval process.</p><button className="sidebar-reset" onClick={() => { setError(''); setModal('reset'); }} disabled={pending}><RotateCcw size={13} />Reset demonstration</button></>}</div><div className="sidebar-bottom"><span className="environment-dot" />Synthetic workspace</div></aside>
    <div className="main-shell"><header className="topbar"><div><span>Workspace</span><ChevronRight size={13} /><strong>Payables</strong></div><span className="environment"><FlaskConical size={13} />{environment}</span></header>
      <main>
        <div className="sr-only" role="status" aria-live="polite">{checking ? 'Checking the submitted approval. No transaction is being sent.' : busy ? 'Updating payable…' : notice}</div>
        {error && !state.operation && <div className="message error" role="alert"><span>{error}</span><button onClick={refresh}>Refresh</button><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
        {notice && <div className="message notice"><Check size={16} /><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16} /></button></div>}
        {!tour && operation && <section className="recovery-panel" aria-labelledby="recovery-title"><div className="recovery-header"><Clock3 size={19} /><div><span className="eyebrow">{operationName.toUpperCase()} STATUS</span><h2 id="recovery-title">{operationSummary}</h2></div></div><p>{operationFunds} The payable stays locked until the outcome is verified.</p><p>{operationHelp}</p><div className="recovery-actions">{canReconcile ? <button className="button primary" disabled={busy || checking} onClick={reconcile}>{checking ? <LoaderCircle className="spin" size={15} /> : <RotateCcw size={15} />}{checking ? 'Checking approval…' : 'Check status'}</button> : <button className="button secondary" disabled={busy || checking} onClick={refresh}><RotateCcw size={15} />Refresh state</button>}</div><div className="recovery-result" role="status" aria-live="polite">{checking ? <p>Checking whether the submitted approval can be verified on the network. No new transaction is being sent.</p> : lastCheckMessage ? <><strong>Latest check</strong><p>{safeOperationText(lastCheckMessage)}</p>{lastCheckedAt && <small>Checked {date(lastCheckedAt)} at {time(lastCheckedAt)}</small>}</> : <p>{canReconcile ? 'No status check recorded yet.' : 'This operation requires operator assistance; automatic recovery is not supported.'}</p>}{error && <p>{safeOperationText(error)}</p>}</div>{operation.signature && <details className="recovery-identifier"><summary>Transaction identifier<ChevronDown size={14} /></summary><div><code>{operation.signature}</code><button className="icon-button" aria-label="Copy pending transaction identifier" onClick={() => copy(operation.signature!)}><Copy size={15} /></button></div></details>}</section>}
        {page === 'inbox' ? <>
          <div className="page-heading inbox-heading"><div><div className="eyebrow">YOUR FINANCE DESK</div><h1>Good work. Clear payments.</h1><p>Review the details. Agree on the amount. Pay with confidence.</p></div><span className="date-stamp">30 SEPTEMBER 2026<br /><b>WORKSPACE 01</b></span></div>
          <div className="inbox-summary"><div><span>{paid ? tour ? 'Settled in the recorded run' : 'Settled this session' : 'Awaiting your team'}</span><strong>{money(state.amountDue)}<small>Test USD</small></strong></div><div className="summary-divider" /><div><span>Payables in this workspace</span><strong>01<small>synthetic invoice</small></strong></div><div className="summary-illustration" aria-hidden="true"><FileText size={29} strokeWidth={1.3} /><Check size={21} /></div></div>
          <div className="list-header"><h2>Payables</h2><span>One invoice, from review to receipt.</span></div>
          <div className="list-tabs" role="group" aria-label="Filter payables">{(['all', 'unpaid', 'paid'] as const).map(f => <button className={filter === f ? 'selected' : ''} key={f} onClick={() => setFilter(f)}>{f === 'all' ? 'All payables' : f === 'unpaid' ? 'To pay' : 'Paid'}<span>{f === 'all' ? 1 : f === 'paid' ? Number(paid) : Number(!paid)}</span></button>)}</div>
          <div className="invoice-table"><div className="table-head"><span>SUPPLIER / INVOICE</span><span>DUE DATE</span><span>STATUS</span><span>{paid ? "AMOUNT PAID" : "AMOUNT DUE"}</span><span /></div>{showInvoice ? <button className="invoice-row" onClick={openDetail}><div className="supplier-cell"><span className="supplier-monogram">{state.invoice.supplier.slice(0, 1)}</span><div><strong>{state.invoice.supplier}</strong><small>{state.invoice.number} · {state.invoice.description}</small></div></div><span>{date(state.invoice.due)}</span><Status state={state} pending={pending} /><strong className="row-money">{money(listAmount)}<small>Test USD</small></strong><ArrowRight size={18} /></button> : <div className="empty-state"><CircleCheck size={25} /><h3>{filter === 'paid' ? 'No paid invoices yet' : 'Everything here is paid'}</h3><p>{filter === 'paid' ? 'Completed payments will appear here with their evidence.' : 'Open All payables to review the payment evidence.'}</p></div>}</div>
          <div className="inbox-footer"><ShieldCheck size={17} /><p><strong>The amount you approve is the amount you authorize.</strong><br />When an invoice changes, approval starts fresh.</p><span>BUILT FOR THE MOMENT BEFORE PAYMENT.</span></div>
        </> : <>
          <button className="back-link" onClick={() => setPage('inbox')}><ArrowLeft size={14} />All payables</button>
          <div className="page-heading detail-heading"><div><div className="eyebrow">PAYABLE / {state.invoice.number}</div><h1>{state.invoice.supplier}</h1><p>{state.invoice.description}<span className="dot-separator">·</span>Due {date(state.invoice.due)}</p></div><div className="heading-status"><Status state={state} pending={pending} /><span>Updated {date(state.evidence.at(-1)?.at ?? state.invoice.issued)}</span></div></div>
          <div className="detail-tabs" role="tablist" aria-label="Payable details" onKeyDown={e => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); const next = e.key === "Home" ? "overview" : e.key === "End" ? "evidence" : tab === "overview" ? "evidence" : "overview"; setTab(next); e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next === "overview" ? 0 : 1]?.focus(); } }}><button role="tab" tabIndex={tab === 'overview' ? 0 : -1} aria-selected={tab === 'overview'} className={tab === 'overview' ? 'selected' : ''} onClick={() => setTab('overview')}><FileText size={16} />Overview</button><button role="tab" tabIndex={tab === 'evidence' ? 0 : -1} aria-selected={tab === 'evidence'} className={tab === 'evidence' ? 'selected' : ''} onClick={() => setTab('evidence')}><ShieldCheck size={16} />Evidence<span>{state.evidence.length}</span></button><a href={tour?.evidenceHref ?? "/api/evidence"} download className="export-link"><Download size={15} />{tour ? "Recorded evidence (JSON)" : "Export evidence (JSON)"}</a></div>
          <div className="workbench"><div className="document-column">{tab === 'overview' ? <>
            <div className="document-caption"><span><FileText size={14} />INVOICE DETAILS</span><span>Synthetic document</span></div>
            <article className="invoice-paper" aria-label="Invoice document"><div className="paper-heading"><div className="vendor-wordmark">{state.invoice.supplier}<span>{state.invoice.supplierEmail}</span></div><div className="invoice-label">INVOICE<strong>{state.invoice.number}</strong></div></div><div className="paper-meta"><div><span>BILLED TO</span><strong>Northstar Studio</strong><p>Creative & digital operations<br />Berlin, Germany</p></div><div><span>ISSUED</span><strong>{date(state.invoice.issued)}</strong><span className="second-label">PAYMENT DUE</span><strong>{date(state.invoice.due)}</strong></div></div><div className="line-item-head"><span>DESCRIPTION</span><span>AMOUNT</span></div><div className="line-item"><div><strong>{state.invoice.description}</strong><p>Services as agreed · September 2026</p></div><span>{money(state.amountOriginal)}.00</span></div><div className="paper-totals"><div><span>Invoice total</span><span>{money(state.amountOriginal)}.00</span></div>{state.creditNote && <div className="credit-text"><span>Credit · {state.creditNote.reference}</span><span>−{money(state.credit)}.00</span></div>}<div className="paper-total"><span>{paid ? 'Paid' : 'Amount due'}</span><strong>{money(state.amountDue)}.00<small>Test USD</small></strong></div></div><div className="paper-footer"><div><span>PAYMENT RECIPIENT</span><code>{short(state.invoice.recipient)}</code></div><span className="paper-seal"><ShieldCheck size={17} />LINKED TO THIS PAYABLE</span></div></article>
            {state.creditNote && <section className="credit-card"><div className="credit-icon"><ArrowDownLeft size={22} /></div><div><span className="eyebrow">SUPPLIER CREDIT</span><h3>{state.creditNote.reference}<span>−{money(state.creditNote.amount)} Test USD</span></h3><p>{state.creditNote.reason}</p><small>Applied {date(state.creditNote.at)} · Earlier approvals expired</small></div></section>}
            <section className="history-section"><div className="section-line"><h2>Activity</h2><span>{state.evidence.length} events</span></div><div className="history">{[...state.evidence].reverse().slice(0, 5).map(e => <div className="history-event" key={e.id}><span className={`history-marker ${e.kind}`} /> <div><strong>{e.title}</strong>{approvalAnnotation(e) && <p className="approval-annotation">{approvalAnnotation(e)}</p>}<p>{evidenceDescription(e)}</p><small>{e.actor} · {time(e.at)}</small></div></div>)}</div>{state.evidence.length > 5 && <button className="text-button" onClick={() => setTab('evidence')}>View complete evidence<ArrowRight size={14} /></button>}</section>
          </> : <section className="evidence-view"><div className="evidence-heading"><span className="eyebrow">THE COMPLETE PICTURE</span><h2>From invoice to payment.</h2><p>Documents, decisions and outcomes, linked to one payable.</p></div><div className="evidence-summary"><div><span>Original invoice</span><strong>{money(state.amountOriginal)}</strong></div><span>−</span><div><span>Supplier credit</span><strong>{money(state.credit)}</strong></div><span>=</span><div><span>{paid ? 'Paid' : 'Current payable'}</span><strong>{money(state.amountDue)}<small> Test USD</small></strong></div></div>{operation && <section className="unresolved-evidence" aria-label="Unresolved operation"><span className="eyebrow">UNRESOLVED · NOT A COMPLETED EVENT</span><h3>{operationSummary}</h3><p>{operationFunds} This operation is not included in the confirmed events below.</p><p>{canReconcile ? 'Use Check status above to verify the already submitted approval.' : 'Operator assistance is required. Automatic recovery of this operation is not supported.'}</p></section>}<div className="evidence-list">{state.evidence.map((e, index) => <article className={`evidence-item ${e.kind}`} key={e.id}><span className="evidence-number">{String(index + 1).padStart(2, '0')}</span><div><div className="evidence-title"><h3>{e.title}</h3><span>{e.outcome === 'confirmed' ? 'Confirmed on devnet' : e.kind === 'blocked' ? 'Blocked' : state.mode === 'rehearsal' ? 'Rehearsal record' : 'Recorded'}</span></div>{approvalAnnotation(e) && <p className="approval-annotation">{approvalAnnotation(e)}</p>}<p>{evidenceDescription(e)}</p><div className="event-meta">{e.actor}<span>·</span>{date(e.at)}, {time(e.at)}{e.amount !== undefined && <><span>·</span><b>{money(e.amount)} Test USD</b></>}</div>{e.signature && <a className="text-button" href={`https://explorer.solana.com/tx/${encodeURIComponent(e.signature)}?cluster=devnet`} target="_blank" rel="noreferrer">View transaction<ExternalLink size={13} /></a>}</div></article>)}</div><details className="technical-details"><summary>Technical identifiers<ChevronDown size={16} /></summary>{[['Scenario', state.scenarioId], ['Recipient', state.invoice.recipient], ['Token mint', state.asset.mint], ['Program', state.chain.programId], ['Obligation', state.chain.obligation]].filter(([, value]) => value).map(([label, value]) => <div key={label}><span>{label}</span><code>{value}</code><button className="icon-button" aria-label={`Copy ${label}`} onClick={() => copy(value!)}><Copy size={14} /></button></div>)}</details></section>}
          </div>{approvalPanel}</div>
          {tour ? blocked && <section className="control-section recorded-control"><div className="control-result"><ShieldCheck size={18} /><div><span className="eyebrow">RECORDED CONTROL RESULT</span><strong>{blocked.title}</strong><p>{blocked.detail}</p>{blocked.signature && <a className="text-button" href={`https://explorer.solana.com/tx/${encodeURIComponent(blocked.signature)}?cluster=devnet`} target="_blank" rel="noreferrer">Inspect rejected devnet transaction<ExternalLink size={13} /></a>}</div></div></section> : <section className="control-section"><button className="control-heading" onClick={() => setControlsOpen(!controlsOpen)} aria-expanded={controlsOpen}><span><FlaskConical size={17} /><strong>Demo control check</strong><small>Verify that an earlier approval cannot pay a changed invoice.</small></span><ChevronDown size={16} className={controlsOpen ? 'rotated' : ''} /></button>{controlsOpen && <div className="control-body"><div><h3>A change should stop the old payment.</h3><p>The approved payment is saved automatically. After applying a credit, switch to the payment operator and test the earlier {money(state.previousInstruction?.amount ?? state.amountDue)} Test USD instruction. A successful control blocks it without sending payment.</p><div className="control-actions"><button className="button secondary" disabled={pending || actor !== 'executor' || state.status !== 'approved' || Boolean(state.previousInstruction)} onClick={() => act('capture-previous')}>{state.previousInstruction ? <Check size={15} /> : <Plus size={15} />}{state.previousInstruction ? 'Earlier payment saved' : 'Save approved payment'}</button><button className="button secondary" disabled={pending || actor !== 'executor' || !state.previousInstruction || state.previousInstruction.revision === state.revision} onClick={() => act('test-previous')}><ShieldCheck size={15} />Test previous approval</button></div>{blocked && <div className="control-result"><ShieldCheck size={18} /><div><strong>{blocked.title}</strong><p>{blocked.detail}</p></div></div>}</div><div className="control-tip"><span>DEMO SEQUENCE</span><p>Two approvals → reviewer applies credit → payment operator tests previous approval → two new approvals → payment operator pays.</p></div></div>}</section>}
        </>}
        <footer className="main-footer"><span>kontor</span><p>Clear approvals. Controlled payments.</p><span>Test USD has no monetary value.</span></footer>
      </main>
    </div>
    {!tour && modal === 'credit' && <Modal error={error} title="Apply supplier credit" onClose={() => !busy && setModal(null)}><form onSubmit={async e => { e.preventDefault(); if (await act('apply-credit', { amount: Number(creditAmount), reference: creditReference, reason: creditReason })) setModal(null); }}><p className="modal-intro">Reduce the payable and keep the adjustment linked to this invoice.</p><label className="field">Credit amount · Test USD<input type="number" min="1" max={state.amountDue - 1} step="1" required value={creditAmount} onChange={e => setCreditAmount(e.target.value)} /></label><label className="field">Credit note reference<input required value={creditReference} onChange={e => setCreditReference(e.target.value)} /></label><label className="field">Reason<textarea required rows={2} value={creditReason} onChange={e => setCreditReason(e.target.value)} /></label><div className="credit-preview"><div><span>Current amount due</span><strong>{money(state.amountDue)} Test USD</strong></div><div><span>Credit</span><strong>−{money(Number(creditAmount) || 0)} Test USD</strong></div><div><span>New amount due</span><strong>{money(state.amountDue - (Number(creditAmount) || 0))} Test USD</strong></div></div><div className="modal-warning"><ShieldCheck size={18} /><p>Existing approvals will expire. Two new approvals are required for the revised amount.</p></div><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setModal(null)} disabled={busy}>Cancel</button><button className="button primary" disabled={pending}>{busy && <LoaderCircle className="spin" size={16} />}Apply credit</button></div></form></Modal>}
    {modal === 'pay' && <Modal error={error} title={tour ? "Review the recorded payment" : "Review this payment"} onClose={() => !busy && setModal(null)}><p className="modal-intro">The current amount has been approved by two people.</p><div className="payment-confirm"><span>{tour ? 'RECORDED PAYMENT TO' : 'PAYING'} {state.invoice.supplier.toUpperCase()}</span><strong>{money(state.amountDue)}<small>Test USD</small></strong><code>{state.invoice.recipient}</code></div><p className="modal-warning">{tour ? 'Static replay of the payment review. This shows a past devnet transaction; no new payment is sent.' : state.mode === 'rehearsal' ? 'Rehearsal only. This records a local demonstration payment; no on-chain transaction is sent.' : 'This sends test tokens on Solana devnet. A confirmed payment cannot be recalled.'}</p><div className="modal-actions"><button className="button secondary" onClick={() => setModal(null)} disabled={busy}>{tour ? "Close review" : "Back"}</button>{tour ? tour.onShowRecordedPayment && <button className="button primary" onClick={tour.onShowRecordedPayment}>Show recorded payment result<ArrowRight size={16} /></button> : <button className="button primary" disabled={pending} onClick={async () => { if (await act('pay')) { setModal(null); setTab('evidence'); } }}>{busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}Confirm {money(state.amountDue)} Test USD</button>}</div></Modal>}
    {!tour && modal === 'reset' && <Modal error={error} title="Start a fresh demonstration?" onClose={() => !busy && setModal(null)}><p className="modal-intro">This resets the synthetic payable, approvals and local evidence for a new walkthrough. Export the evidence first if you want to keep this run.</p><div className="modal-actions"><button className="button secondary" onClick={() => setModal(null)}>Keep this run</button><button className="button primary" disabled={pending} onClick={async () => { if (await act('reset')) { setModal(null); setActor('reviewer'); setPage('inbox'); setFilter('all'); } }}>Reset demonstration</button></div></Modal>}
  </div>;
}
