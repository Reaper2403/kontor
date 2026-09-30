import { createHash } from 'node:crypto';
// This exact UTF-8 JSON is the original document committed by the demo program.
// Recipient/mint are separately and immutably bound by on-chain configuration.
export const invoiceDocument=Object.freeze({schema:'kontor-synthetic-invoice-v1',invoiceNumber:'NF-2026-041',supplier:'Northform Studio',supplierEmail:'accounts@northform.example',description:'Product design support · September 2026',issued:'2026-09-24',due:'2026-10-08',amountBaseUnits:'1000000000',asset:'Test USD',decimals:6,synthetic:true});
export const invoiceDocumentJSON=JSON.stringify(invoiceDocument);
export const invoiceDocumentDigest=createHash('sha256').update(invoiceDocumentJSON,'utf8').digest('hex');
