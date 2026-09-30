import { useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowLeft, ArrowRight, Check, ExternalLink, FileDown, RotateCcw, ShieldCheck } from 'lucide-react';
import App from '../src/App';
import { tourSteps, recordedEvidenceHref, recordedProofLinks } from './recorded-state';

const chapters = [
  { title: 'Approve', start: 'start' },
  { title: 'Credit', start: 'credit-applied' },
  { title: 'Block', start: 'old-instruction-blocked' },
  { title: 'Reapprove', start: 'approval-new-a' },
  { title: 'Pay', start: 'payment-review' },
  { title: 'Evidence', start: 'evidence' },
];
const scenes: Record<string, { chapter: number; eyebrow: string; title: string; body: string; next: string; note?: string }> = {
  start: { chapter: 0, eyebrow: 'THE ORIGINAL INVOICE', title: 'First, agree on the amount.', body: 'Northform Studio is owed 1,000 Test USD. Mara and Jonas must each approve this invoice version before Alex can pay.', next: 'Show Mara’s first approval', note: 'The controls below are the actual Kontor workbench, presented read-only.' },
  'approval-a': { chapter: 0, eyebrow: 'MARA · FINANCE LEAD', title: 'One approval. One more to go.', body: 'Mara has approved 1,000 Test USD. Her approval covers this amount, recipient and invoice version. Jonas still needs to review it.', next: 'Show Jonas’s first approval' },
  'approved-original': { chapter: 0, eyebrow: 'JONAS · TEAM LEAD', title: 'Approved does not mean paid.', body: 'Both approvals are recorded for 1,000 Test USD. The payment is ready—but a supplier credit is about to change the invoice.', next: 'Show the 200 credit' },
  'credit-applied': { chapter: 1, eyebrow: 'LENA · FINANCE REVIEWER', title: 'A small credit changes the decision.', body: 'Lena applies a 200 Test USD supplier credit. The payable becomes 800. Both earlier approvals expire: they authorized a different amount.', next: 'Show the obsolete payment attempt', note: 'Look at the approval route: the revised invoice needs two fresh approvals.' },
  'old-instruction-blocked': { chapter: 2, eyebrow: 'ALEX · PAYMENT OPERATOR', title: 'The old instruction meets a hard stop.', body: 'Alex tests the saved 1,000 Test USD instruction. The Solana program rejects its obsolete invoice version. No Test USD moves.', next: 'Show Mara’s fresh approval', note: 'The recorded rejected transaction may still incur a devnet SOL fee.' },
  'approval-new-a': { chapter: 3, eyebrow: 'MARA · FINANCE LEAD', title: 'A fresh amount needs a fresh yes.', body: 'Mara approves the revised 800 Test USD payable. Her earlier 1,000 approval remains in the history, clearly marked as expired.', next: 'Show Jonas’s fresh approval' },
  'approved-revised': { chapter: 3, eyebrow: 'JONAS · TEAM LEAD', title: 'Two approvals, now for 800.', body: 'Jonas also approves the new version. Both approvals now match the amount and recipient Alex is about to review.', next: 'Review the recorded payment' },
  'payment-review': { chapter: 4, eyebrow: 'ALEX · PAYMENT OPERATOR', title: 'Check the amount before it leaves.', body: 'Inspect the supplier, fixed recipient and revised 800 Test USD amount using the payment review below, or continue to the recorded result. This reconstruction sends no payment.', next: 'Show the recorded payment result' },
  paid: { chapter: 4, eyebrow: 'RECORDED SOLANA DEVNET RESULT', title: '800 paid. The history stays intact.', body: 'The recorded run settled 800 Test USD after the two fresh approvals. The original invoice, credit and rejected instruction stay linked to the same payable.', next: 'Inspect the recorded evidence' },
  evidence: { chapter: 5, eyebrow: 'FROM CLAIM TO RECEIPT', title: 'Don’t take the tour’s word for it.', body: 'Inspect the recorded rejection and corrected payment on Solana devnet, or download the evidence. These transactions happened on 30 September 2026; your tour clicks submitted nothing.', next: 'Restart the guided demo' },
};
const orderedIds = ['start', 'approval-a', 'approved-original', 'credit-applied', 'old-instruction-blocked', 'approval-new-a', 'approved-revised', 'payment-review', 'paid', 'evidence'];

export default function Tour() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const guideRef = useRef<HTMLHeadingElement>(null);
  const welcomeRef = useRef<HTMLHeadingElement>(null);
  const hasNavigated = useRef(false);
  const scene = activeId ? scenes[activeId] : null;
  const step = tourSteps.find(item => item.id === activeId);
  const stepIndex = activeId ? orderedIds.indexOf(activeId) : -1;
  const go = (id: string | null) => { hasNavigated.current = true; setActiveId(id); };
  const next = () => go(stepIndex === orderedIds.length - 1 ? 'start' : orderedIds[stepIndex + 1]);

  useEffect(() => {
    if (!hasNavigated.current) return;
    const element = activeId ? guideRef.current : welcomeRef.current;
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, [activeId]);

  return <div className="tour-site">
    <header className="tour-masthead">
      <button className="tour-wordmark" onClick={() => go(null)} aria-label="Kontor tour home">kontor<span aria-hidden="true">↗</span></button>
      <span className="tour-mode"><span aria-hidden="true" />Guided demo <b>·</b> Static replay</span>
      {activeId && <button className="tour-restart" onClick={() => go('start')}><RotateCcw size={14} />Restart<span className="tour-desktop-word"> tour</span></button>}
    </header>

    {!activeId ? <main className="tour-welcome">
      <div className="tour-welcome-copy">
        <p className="tour-kicker">BUILT FOR THE MOMENT BEFORE PAYMENT</p>
        <h1 ref={welcomeRef} tabIndex={-1}>The invoice changed.<br /><em>Should the old payment still go through?</em></h1>
        <p className="tour-deck">An approved 1,000 invoice. A 200 supplier credit. Follow the decision that keeps an obsolete payment from becoming an expensive mistake.</p>
        <p className="tour-before-click">This is a static replay. Your clicks send no transactions.</p>
        <div className="tour-start-actions"><button className="tour-button tour-button-primary" onClick={() => go('start')}>Follow the payment<ArrowRight size={18} /></button><button className="tour-text-link" onClick={() => go('evidence')}>Inspect recorded evidence<ArrowRight size={15} /></button></div>
        <p className="tour-runtime-note">Self-paced · Six chapters · No wallet needed</p>
      </div>
      <div className="tour-ledger" aria-label="An approved 1,000 Test USD invoice receives a 200 credit. The old payment is blocked; 800 needs fresh approvals.">
        <div className="tour-ledger-top"><span>NORTHFORM STUDIO</span><span>NF-2026-041</span></div>
        <div className="tour-ledger-original"><div><span>Originally approved</span><strong>1,000<small>Test USD</small></strong></div><div className="tour-approval-seal"><Check size={15} /><span>Two<br />approvals</span></div></div>
        <div className="tour-credit-strip"><ArrowDownLeft size={22} /><span>Then a supplier credit arrives</span><strong>−200</strong></div>
        <div className="tour-ledger-revised"><span>The revised payable</span><strong>800<small>Test USD</small></strong><p>New amount. New approvals.</p></div>
        <div className="tour-stop-stamp"><ShieldCheck size={20} /><div><strong>Old 1,000 instruction blocked</strong><span>Only the newly approved amount can be paid.</span></div></div>
        <div className="tour-ledger-foot"><span>INVOICE → CREDIT → CONTROL → RECEIPT</span><span>01 / 01</span></div>
      </div>
      <div className="tour-welcome-disclosure"><ShieldCheck size={20} /><p><strong>Real product screens. Recorded proof.</strong> This guided demo reconstructs a prior run using the actual Kontor interface. Clicks only navigate the tour; they submit no transactions. The final receipt links to recorded Solana devnet evidence. Test USD has no monetary value.</p></div>
    </main> : scene && step ? <>
      <section className="tour-guide" aria-label="Guided tour">
        <nav className="tour-chapters" aria-label="Tour chapters">{chapters.map((chapter, index) => <button key={chapter.title} className={scene.chapter === index ? 'current' : ''} aria-current={scene.chapter === index ? 'step' : undefined} onClick={() => go(chapter.start)}><span>{String(index + 1).padStart(2, '0')}</span>{chapter.title}</button>)}</nav>
        <div className="tour-guide-copy"><div><p className="tour-kicker">{scene.eyebrow}</p><h1 ref={guideRef} tabIndex={-1}>{scene.title}</h1><p className="tour-scene-body">{scene.body}</p></div><aside className="tour-guide-aside"><span className="tour-scene-count">CHAPTER {scene.chapter + 1} OF 6<span>Snapshot {stepIndex + 1} of {orderedIds.length}</span></span><p>{scene.note ?? 'You are viewing reconstructed historical state. Tour navigation sends no transactions.'}</p></aside></div>
        <div className="tour-scene-announcement sr-only" role="status" aria-live="polite">Chapter {scene.chapter + 1} of 6. {scene.title} {scene.body}</div>
        <div className="tour-guide-actions"><button className="tour-button tour-button-primary" onClick={next}>{scene.next}{activeId === 'evidence' ? <RotateCcw size={16} /> : <ArrowRight size={16} />}</button><span>{activeId === 'evidence' ? 'Return to the first snapshot · No transaction sent' : 'Show the next recorded state · No transaction sent'}</span></div>
        {activeId === 'old-instruction-blocked' && <div className="tour-rejection-callout"><ShieldCheck size={23} /><div><strong>1,000 Test USD instruction rejected</strong><p>Invoice version changed · No Test USD moved · The current payable remains 800.</p></div></div>}
        {activeId === 'old-instruction-blocked' && <a className="tour-inline-proof" href={recordedProofLinks.blocked} target="_blank" rel="noreferrer">Inspect the recorded rejected transaction<ExternalLink size={14} /><span className="sr-only"> (opens in a new tab)</span></a>}
        {activeId === 'evidence' && <div className="tour-proof-cards">
          <a href={recordedProofLinks.blocked} target="_blank" rel="noreferrer"><span>01 / THE CONTROL</span><strong>Obsolete instruction rejected<ExternalLink size={17} /></strong><p>Recorded failed devnet transaction. No Test USD moved.</p><span className="sr-only">Opens in a new tab</span></a>
          <a href={recordedProofLinks.payment} target="_blank" rel="noreferrer"><span>02 / THE SETTLEMENT</span><strong>Corrected 800 payment<ExternalLink size={17} /></strong><p>Recorded confirmed devnet transaction after fresh approvals.</p><span className="sr-only">Opens in a new tab</span></a>
          <a href={recordedEvidenceHref} download><span>03 / THE RECORD</span><strong>Download evidence JSON<FileDown size={17} /></strong><p>The selected run, transaction proofs and reconstruction provenance.</p></a>
        </div>}
      </section>
      <div className="tour-workbench-label"><span>THE KONTOR WORKBENCH</span><span>Read-only historical snapshot · 30 September 2026</span></div>
      <div className="tour-workbench"><App key={step.id} tour={{ ...step, paymentReviewAvailable: activeId === 'payment-review', evidenceHref: recordedEvidenceHref, onShowRecordedPayment: () => go('paid') }} /></div>
      <section className="tour-evidence-note"><p><strong>A prototype with a precise boundary.</strong> Kontor protects the program-controlled payable and vault. This demonstration uses synthetic Test USD, server-held demo role keys and a trusted upgrade authority. It is unaudited and does not establish production custody or accounting readiness.</p><a href={recordedEvidenceHref} download>Recorded evidence & provenance<FileDown size={14} /></a></section>
      <div className="tour-navigation" aria-label="Snapshot navigation"><button className="tour-back" onClick={() => go(stepIndex > 0 ? orderedIds[stepIndex - 1] : null)}><ArrowLeft size={16} />{stepIndex > 0 ? 'Back' : 'Introduction'}</button><span className="tour-navigation-position">{String(stepIndex + 1).padStart(2, '0')}<span> / {orderedIds.length}</span></span><button className="tour-button tour-button-primary" onClick={next}>{scene.next}{activeId === 'evidence' ? <RotateCcw size={16} /> : <ArrowRight size={16} />}</button></div>
    </> : <div className="tour-missing"><p>This scene is unavailable.</p><button className="tour-button tour-button-primary" onClick={() => go(null)}>Return to the introduction</button></div>}
    <footer className="tour-footer"><span>kontor ↗</span><p>Clear approvals. Controlled payments.</p><span>Solana devnet · Test funds only</span></footer>
  </div>;
}
