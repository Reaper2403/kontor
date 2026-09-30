//! Kontor synthetic payable controller. No withdrawal, close, reset or arbitrary CPI.
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{account_info::AccountInfo, clock::Clock, entrypoint, entrypoint::ProgramResult,
    hash::hashv, msg, program::{invoke, invoke_signed}, program_error::ProgramError,
    program_option::COption, program_pack::Pack, pubkey::Pubkey, rent::Rent,
    system_instruction, system_program, sysvar::Sysvar};
use spl_token::state::{Account as TokenAccount, AccountState, Mint};

#[cfg(not(feature = "no-entrypoint"))]
entrypoint!(process_instruction);

const CONFIG: [u8;8] = *b"KNTRCFG1";
const OBLIGATION: [u8;8] = *b"KNTROBL1";
const REVISION: [u8;8] = *b"KNTRREV1";
const CONFIG_LEN: usize = 232;
const OBLIGATION_LEN: usize = 129;
const REVISION_LEN: usize = 217;

#[repr(u32)]
#[derive(Clone,Copy,Debug)]
pub enum Error { Unauthorized=7000, InvalidAccount=7001, StaleRevision=7002, AlreadyPaid=7003,
    MissingApprovals=7004, ApprovalExpired=7005, InvalidAmount=7006, DuplicateApproval=7007,
    CreditAlreadyApplied=7008, InvalidInstruction=7009, AliasedAccount=7010 }
fn fail(e: Error) -> ProgramError { msg!("Kontor::{:?}", e); ProgramError::Custom(e as u32) }
fn check(ok: bool, e: Error) -> ProgramResult { if ok {Ok(())} else {Err(fail(e))} }

#[derive(BorshSerialize,BorshDeserialize,Debug)]
pub struct Config { magic:[u8;8], registrar:[u8;32], reviewer:[u8;32], approver_a:[u8;32],
    approver_b:[u8;32], mint:[u8;32], recipient:[u8;32], recipient_owner:[u8;32] }
#[derive(BorshSerialize,BorshDeserialize,Debug)]
pub struct Obligation { magic:[u8;8], config:[u8;32], id:u64, original:u64, invoice:[u8;32],
    revision:u64, paid:bool, vault:[u8;32] }
#[derive(BorshSerialize,BorshDeserialize,Debug)]
pub struct Revision { magic:[u8;8], obligation:[u8;32], revision:u64, amount:u64, credit:u64,
    evidence:[u8;32], credit_digest:[u8;32], reason_digest:[u8;32], expiry:i64,
    approvals:u8, approved_at:[i64;2], reviewer:[u8;32] }

fn key(b:&[u8;32]) -> Pubkey { Pubkey::new_from_array(*b) }
fn signer(a:&AccountInfo) -> ProgramResult { check(a.is_signer,Error::Unauthorized) }
fn writable(a:&AccountInfo) -> ProgramResult { check(a.is_writable,Error::InvalidAccount) }
fn unique(accounts:&[AccountInfo]) -> ProgramResult {
    for (i,a) in accounts.iter().enumerate() { for b in &accounts[i+1..] {
        check(a.key != b.key,Error::AliasedAccount)?;
    }} Ok(())
}
fn read<T:BorshDeserialize>(a:&AccountInfo, program:&Pubkey,len:usize)->Result<T,ProgramError>{
    check(a.owner == program && a.data_len()==len,Error::InvalidAccount)?;
    T::try_from_slice(&a.try_borrow_data()?).map_err(|_|fail(Error::InvalidAccount))
}
fn write<T:BorshSerialize>(a:&AccountInfo,value:&T)->ProgramResult {
    writable(a)?;
    let data=borsh::to_vec(value).map_err(|_|fail(Error::InvalidAccount))?;
    check(data.len()==a.data_len(),Error::InvalidAccount)?;
    a.try_borrow_mut_data()?.copy_from_slice(&data); Ok(())
}
fn config(a:&AccountInfo,program:&Pubkey)->Result<Config,ProgramError>{
    let c:Config=read(a,program,CONFIG_LEN)?;
    check(c.magic==CONFIG,Error::InvalidAccount)?;
    let (expected,_)=Pubkey::find_program_address(&[b"config",&c.registrar],program);
    check(*a.key==expected,Error::InvalidAccount)?; Ok(c)
}
fn obligation(a:&AccountInfo,c:&AccountInfo,program:&Pubkey)->Result<Obligation,ProgramError>{
    let o:Obligation=read(a,program,OBLIGATION_LEN)?;
    let (expected,_)=Pubkey::find_program_address(&[b"obligation",c.key.as_ref(),&o.id.to_le_bytes()],program);
    check(o.magic==OBLIGATION && key(&o.config)==*c.key && expected==*a.key,Error::InvalidAccount)?; Ok(o)
}
fn revision(a:&AccountInfo,o:&AccountInfo,index:u64,program:&Pubkey)->Result<Revision,ProgramError>{
    let r:Revision=read(a,program,REVISION_LEN)?;
    let (expected,_)=Pubkey::find_program_address(&[b"revision",o.key.as_ref(),&index.to_le_bytes()],program);
    check(r.magic==REVISION && key(&r.obligation)==*o.key && r.revision==index && expected==*a.key,Error::InvalidAccount)?; Ok(r)
}
fn token(a:&AccountInfo)->Result<TokenAccount,ProgramError>{
    check(a.owner==&spl_token::id(),Error::InvalidAccount)?;
    TokenAccount::unpack(&a.try_borrow_data()?).map_err(|_|fail(Error::InvalidAccount))
}
fn mint(a:&AccountInfo)->ProgramResult {
    check(a.owner==&spl_token::id(),Error::InvalidAccount)?;
    let m=Mint::unpack(&a.try_borrow_data()?)?;
    check(m.is_initialized && m.decimals==6,Error::InvalidAccount)
}
fn recipient(a:&AccountInfo,c:&Config)->ProgramResult {
    let t=token(a)?;
    check(*a.key==key(&c.recipient) && t.mint==key(&c.mint) && t.owner==key(&c.recipient_owner),Error::InvalidAccount)
}
fn new_account<'a>(payer:&AccountInfo<'a>,target:&AccountInfo<'a>,sys:&AccountInfo<'a>,owner:&Pubkey,
    len:usize,seeds:&[&[u8]])->ProgramResult {
    signer(payer)?; writable(payer)?; writable(target)?;
    check(*sys.key==system_program::id() && sys.executable,Error::InvalidAccount)?;
    check(target.owner==&system_program::id() && target.data_is_empty() && target.lamports()==0,Error::InvalidAccount)?;
    invoke_signed(&system_instruction::create_account(payer.key,target.key,Rent::get()?.minimum_balance(len),len as u64,owner),
        &[payer.clone(),target.clone(),sys.clone()],&[seeds])
}
fn bytes<const N:usize>(data:&[u8],at:usize)->Result<[u8;N],ProgramError>{
    data.get(at..at+N).and_then(|x|x.try_into().ok()).ok_or_else(||fail(Error::InvalidInstruction))
}
fn u64_at(d:&[u8],at:usize)->Result<u64,ProgramError>{Ok(u64::from_le_bytes(bytes(d,at)?))}
fn i64_at(d:&[u8],at:usize)->Result<i64,ProgramError>{Ok(i64::from_le_bytes(bytes(d,at)?))}
fn expiry(value:i64)->ProgramResult {
    let now=Clock::get()?.unix_timestamp;
    check(value>now && value<=now.checked_add(86400).ok_or_else(||fail(Error::InvalidAmount))?,Error::ApprovalExpired)
}
fn current(o:&Obligation,expected:u64)->ProgramResult {
    check(!o.paid,Error::AlreadyPaid)?; check(o.revision==expected,Error::StaleRevision)
}

pub fn process_instruction(program:&Pubkey,accounts:&[AccountInfo],data:&[u8])->ProgramResult {
    unique(accounts)?;
    let tag=*data.first().ok_or_else(||fail(Error::InvalidInstruction))?;
    match tag {
        0=>{
            check(data.len()==97 && accounts.len()==5,Error::InvalidInstruction)?;
            let (payer,cfg,ma,dst,sys)=(&accounts[0],&accounts[1],&accounts[2],&accounts[3],&accounts[4]);
            signer(payer)?; mint(ma)?; let dest=token(dst)?;
            check(dest.mint==*ma.key && dest.state==AccountState::Initialized,Error::InvalidAccount)?;
            let reviewer=bytes(data,1)?;let a=bytes(data,33)?;let b=bytes(data,65)?;
            check(a!=b && a!=[0;32] && b!=[0;32] && reviewer!=[0;32],Error::Unauthorized)?;
            let (expected,bump)=Pubkey::find_program_address(&[b"config",payer.key.as_ref()],program);
            check(*cfg.key==expected,Error::InvalidAccount)?;
            new_account(payer,cfg,sys,program,CONFIG_LEN,&[b"config",payer.key.as_ref(),&[bump]])?;
            write(cfg,&Config{magic:CONFIG,registrar:payer.key.to_bytes(),reviewer,approver_a:a,approver_b:b,
                mint:ma.key.to_bytes(),recipient:dst.key.to_bytes(),recipient_owner:dest.owner.to_bytes()})?;
            msg!("Kontor::ConfigurationCreated"); Ok(())
        },
        1=>{
            check(data.len()==57 && accounts.len()==9,Error::InvalidInstruction)?;
            let (payer,cfg,obl,rev,vault,ma,dst,sys,tp)=(&accounts[0],&accounts[1],&accounts[2],&accounts[3],&accounts[4],&accounts[5],&accounts[6],&accounts[7],&accounts[8]);
            signer(payer)?; let c=config(cfg,program)?;
            check(*payer.key==key(&c.registrar),Error::Unauthorized)?;
            check(*ma.key==key(&c.mint) && *tp.key==spl_token::id() && tp.executable,Error::InvalidAccount)?;
            mint(ma)?; recipient(dst,&c)?;
            let id=u64_at(data,1)?; let original=u64_at(data,9)?; let invoice=bytes(data,17)?; let expires=i64_at(data,49)?;
            check(original>0 && invoice!=[0;32],Error::InvalidAmount)?; expiry(expires)?;
            let idb=id.to_le_bytes();let zero=0u64.to_le_bytes();
            let (op,ob)=Pubkey::find_program_address(&[b"obligation",cfg.key.as_ref(),&idb],program);
            let (rp,rb)=Pubkey::find_program_address(&[b"revision",obl.key.as_ref(),&zero],program);
            let (vp,vb)=Pubkey::find_program_address(&[b"vault",obl.key.as_ref()],program);
            check(op==*obl.key && rp==*rev.key && vp==*vault.key,Error::InvalidAccount)?;
            new_account(payer,obl,sys,program,OBLIGATION_LEN,&[b"obligation",cfg.key.as_ref(),&idb,&[ob]])?;
            new_account(payer,rev,sys,program,REVISION_LEN,&[b"revision",obl.key.as_ref(),&zero,&[rb]])?;
            new_account(payer,vault,sys,&spl_token::id(),TokenAccount::LEN,&[b"vault",obl.key.as_ref(),&[vb]])?;
            invoke(&spl_token::instruction::initialize_account3(&spl_token::id(),vault.key,ma.key,obl.key)?,&[vault.clone(),ma.clone(),tp.clone()])?;
            write(obl,&Obligation{magic:OBLIGATION,config:cfg.key.to_bytes(),id,original,invoice,revision:0,paid:false,vault:vault.key.to_bytes()})?;
            write(rev,&Revision{magic:REVISION,obligation:obl.key.to_bytes(),revision:0,amount:original,credit:0,
                evidence:invoice,credit_digest:[0;32],reason_digest:[0;32],expiry:expires,approvals:0,approved_at:[0;2],reviewer:[0;32]})?;
            msg!("Kontor::ObligationCreated"); Ok(())
        },
        2=>{
            check(data.len()==9 && accounts.len()==4,Error::InvalidInstruction)?;
            let (actor,cfg,obl,rev)=(&accounts[0],&accounts[1],&accounts[2],&accounts[3]);
            signer(actor)?; writable(obl)?; let c=config(cfg,program)?;let o=obligation(obl,cfg,program)?;
            current(&o,u64_at(data,1)?)?;let mut r=revision(rev,obl,o.revision,program)?;
            check(r.expiry>Clock::get()?.unix_timestamp,Error::ApprovalExpired)?;
            let index=if *actor.key==key(&c.approver_a){0}else if *actor.key==key(&c.approver_b){1}else{return Err(fail(Error::Unauthorized));};
            let mask=1u8<<index;check(r.approvals&mask==0,Error::DuplicateApproval)?;
            r.approvals|=mask;r.approved_at[index]=Clock::get()?.unix_timestamp;write(rev,&r)?;
            msg!("Kontor::ApprovalRecorded revision={} approver={}",o.revision,index);Ok(())
        },
        3=>{
            check(data.len()==89 && accounts.len()==6,Error::InvalidInstruction)?;
            let (actor,cfg,obl,old,new,sys)=(&accounts[0],&accounts[1],&accounts[2],&accounts[3],&accounts[4],&accounts[5]);
            signer(actor)?; let c=config(cfg,program)?;check(*actor.key==key(&c.reviewer),Error::Unauthorized)?;
            let mut o=obligation(obl,cfg,program)?;current(&o,u64_at(data,1)?)?;
            let prior=revision(old,obl,o.revision,program)?;
            // The accepted prototype permits one credit note, eliminating credit-note replay under a new revision.
            check(o.revision==0,Error::CreditAlreadyApplied)?;
            let credit=u64_at(data,9)?;let cd=bytes(data,17)?;let reason=bytes(data,49)?;let expires=i64_at(data,81)?;
            check(credit>0 && credit<prior.amount && cd!=[0;32] && reason!=[0;32],Error::InvalidAmount)?;expiry(expires)?;
            let amount=prior.amount.checked_sub(credit).ok_or_else(||fail(Error::InvalidAmount))?;
            let next=o.revision.checked_add(1).ok_or_else(||fail(Error::InvalidAmount))?;let nb=next.to_le_bytes();
            let (expected,bump)=Pubkey::find_program_address(&[b"revision",obl.key.as_ref(),&nb],program);
            check(*new.key==expected,Error::InvalidAccount)?;
            new_account(actor,new,sys,program,REVISION_LEN,&[b"revision",obl.key.as_ref(),&nb,&[bump]])?;
            let evidence=hashv(&[&o.invoice,&cd,&reason,&credit.to_le_bytes(),&amount.to_le_bytes()]).to_bytes();
            write(new,&Revision{magic:REVISION,obligation:obl.key.to_bytes(),revision:next,amount,credit,
                evidence,credit_digest:cd,reason_digest:reason,expiry:expires,approvals:0,approved_at:[0;2],reviewer:actor.key.to_bytes()})?;
            o.revision=next;write(obl,&o)?;msg!("Kontor::CreditAccepted amount={} revision={}",credit,next);Ok(())
        },
        4=>{
            check(data.len()==9 && accounts.len()==8,Error::InvalidInstruction)?;
            let (executor,cfg,obl,rev,vault,ma,dst,tp)=(&accounts[0],&accounts[1],&accounts[2],&accounts[3],&accounts[4],&accounts[5],&accounts[6],&accounts[7]);
            signer(executor)?;let c=config(cfg,program)?;let mut o=obligation(obl,cfg,program)?;
            // Deliberately before revision-account validation: unchanged old signed instruction rejects for its stale business revision.
            current(&o,u64_at(data,1)?)?;
            let r=revision(rev,obl,o.revision,program)?;
            check(r.approvals==3,Error::MissingApprovals)?;check(r.expiry>Clock::get()?.unix_timestamp,Error::ApprovalExpired)?;
            check(*ma.key==key(&c.mint) && *tp.key==spl_token::id() && tp.executable,Error::InvalidAccount)?;mint(ma)?;recipient(dst,&c)?;
            let (expected,_)=Pubkey::find_program_address(&[b"vault",obl.key.as_ref()],program);let v=token(vault)?;
            check(*vault.key==expected && key(&o.vault)==expected && v.owner==*obl.key && v.mint==*ma.key
                && v.delegate==COption::None && v.close_authority==COption::None && v.state==AccountState::Initialized,Error::InvalidAccount)?;
            check(r.amount>0 && r.amount.checked_add(r.credit)==Some(o.original),Error::InvalidAmount)?;
            writable(vault)?;writable(dst)?;o.paid=true;write(obl,&o)?;
            let id=o.id.to_le_bytes();let (_,bump)=Pubkey::find_program_address(&[b"obligation",cfg.key.as_ref(),&id],program);
            invoke_signed(&spl_token::instruction::transfer_checked(&spl_token::id(),vault.key,ma.key,dst.key,obl.key,&[],r.amount,6)?,
                &[vault.clone(),ma.clone(),dst.clone(),obl.clone(),tp.clone()],&[&[b"obligation",cfg.key.as_ref(),&id,&[bump]]])?;
            msg!("Kontor::Paid amount={} revision={}",r.amount,o.revision);Ok(())
        },
        _=>Err(fail(Error::InvalidInstruction))
    }
}
