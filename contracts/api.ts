export type Actor = 'reviewer' | 'approver-a' | 'approver-b' | 'executor';
export type ActionType = 'approve' | 'apply-credit' | 'capture-previous' | 'test-previous' | 'pay' | 'reset';
export interface Approval { actor: Actor; name: string; role: string; revision: number; amount: number; at: string; current: boolean }
export interface Evidence { id: string; kind: 'created'|'approval'|'credit'|'capture'|'blocked'|'payment'|'reset'; title: string; detail: string; at: string; actor: string; revision: number; amount?: number; signature?: string; outcome?: 'confirmed'|'failed'|'local'; }
export interface State {
 mode: 'devnet'|'rehearsal'; scenarioId: string; revision: number;
 asset: {symbol:'Test USD';decimals:6;mint:string|null;cluster:'devnet'|'local'};
 invoice: {id:string;number:string;supplier:string;supplierEmail:string;description:string;issued:string;due:string;recipient:string};
 amountOriginal:number;credit:number;amountDue:number;status:'needs-approval'|'approved'|'paid';
 creditNote:null|{reference:string;reason:string;amount:number;at:string};
 approvals:Approval[];evidence:Evidence[];
 settlement:null|{amount:number;signature:string|null;at:string;recipient:string;mode:'devnet'|'rehearsal'};
 previousInstruction:null|{revision:number;amount:number;capturedAt:string;tested:boolean;outcome?:string};
 operation:null|{type:string;status:'pending'|'unknown';message:string;actor?:Actor;amount?:number;signature?:string;recoverySupported?:boolean;lastCheckedAt?:string;lastCheckMessage?:string};
 people:{id:Actor;name:string;role:string}[];
 chain:{programId:string|null;obligation:string|null;vault:string|null;recipientBalance:number|null;vaultBalance:number|null};
}
export interface Action {type:ActionType;actor:Actor;expectedRevision:number;idempotencyKey:string;amount?:number;reference?:string;reason?:string}
export interface ApiError {error:{code:string;message:string;retryable:boolean};state:State}
// GET /api/state -> State. POST /api/actions -> State or ApiError with 4xx/5xx.
// GET /api/evidence -> download JSON. POST returns authoritative refreshed state.
// Display units are whole Test USD for this bounded synthetic prototype. On-chain uses six-decimal integers.
