import type { Actor, State } from '../contracts/api';
import recorded from './public/recorded-evidence.json';

export interface TourStep {
  id: string;
  title: string;
  actor: Actor;
  initialPage: 'inbox' | 'detail';
  initialTab: 'overview' | 'evidence';
  initialModal?: 'pay';
  state: State;
}

const finalState = recorded.state as State;
// The module has no service/chain dependency. These are historical display projections.
export function projectRecordedState(eventCount: number): State {
  if (!Number.isInteger(eventCount) || eventCount < 1 || eventCount > finalState.evidence.length) {
    throw new Error('Invalid recorded event boundary');
  }
  const state = structuredClone(finalState);
  state.evidence = state.evidence.slice(0, eventCount);
  const hasCredit = state.evidence.some(event => event.kind === 'credit');
  const hasPayment = state.evidence.some(event => event.kind === 'payment');
  const hasBlocked = state.evidence.some(event => event.kind === 'blocked');
  state.revision = hasCredit ? finalState.revision : finalState.evidence[0].revision;
  state.credit = hasCredit ? finalState.credit : 0;
  state.creditNote = hasCredit ? state.creditNote : null;
  state.amountDue = state.amountOriginal - state.credit;
  state.approvals = state.approvals.filter(approval => state.evidence.some(event =>
    event.kind === 'approval' && event.at === approval.at && event.revision === approval.revision && event.actor === approval.name
  )).map(approval => ({ ...approval, current: approval.revision === state.revision }));
  const currentApprovers = new Set(state.approvals.filter(approval => approval.current).map(approval => approval.actor));
  state.status = hasPayment ? 'paid' : currentApprovers.has('approver-a') && currentApprovers.has('approver-b') ? 'approved' : 'needs-approval';
  state.settlement = hasPayment ? state.settlement : null;
  state.operation = null;
  const savedOriginal = state.approvals.filter(approval => approval.revision === finalState.evidence[0].revision).length === 2;
  state.previousInstruction = savedOriginal && state.previousInstruction
    ? { ...state.previousInstruction, tested: hasBlocked, ...(hasBlocked ? {} : { outcome: undefined }) }
    : null;
  // The final export is not a historical balance journal. Never imply later balances existed earlier.
  if (!hasPayment) state.chain = { ...state.chain, vaultBalance: null, recipientBalance: null };
  return state;
}

const step = (id: string, title: string, eventCount: number, actor: Actor, extra: Partial<Pick<TourStep, 'initialPage' | 'initialTab' | 'initialModal'>> = {}): TourStep => ({
  id, title, actor, initialPage: 'detail', initialTab: 'overview', state: projectRecordedState(eventCount), ...extra,
});

export const tourSteps: TourStep[] = [
  step('inbox', 'A payable ready for review', 1, 'reviewer', { initialPage: 'inbox' }),
  step('start', 'Review the original 1,000', 1, 'approver-a'),
  step('approval-a', 'Mara approved 1,000', 2, 'approver-a'),
  step('approved-original', 'Jonas approved 1,000', 3, 'approver-b'),
  step('credit-applied', 'A 200 credit changes the amount', 4, 'reviewer'),
  step('old-instruction-blocked', 'The old 1,000 instruction was blocked', 5, 'executor'),
  step('approval-new-a', 'Mara approved the revised 800', 6, 'approver-a'),
  step('approved-revised', 'Jonas approved the revised 800', 7, 'approver-b'),
  step('payment-review', 'Review the recorded 800 payment', 7, 'executor', { initialModal: 'pay' }),
  step('paid', '800 Test USD was paid', 8, 'executor'),
  step('evidence', 'Inspect the recorded evidence', 8, 'executor', { initialTab: 'evidence' }),
];

// Relative URL works at the Pages repository base, including localhost subpath testing.
export const recordedEvidenceHref = './recorded-evidence.json';
const explorer = (kind: 'blocked' | 'payment') => {
  const signature = finalState.evidence.find(event => event.kind === kind)?.signature;
  if (!signature) throw new Error(`Missing recorded ${kind} proof`);
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
};
export const recordedProofLinks = { payment: explorer('payment'), blocked: explorer('blocked') };
