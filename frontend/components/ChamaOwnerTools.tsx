'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { keccak256, stringToHex, type Address } from 'viem';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { Check, Copy, LoaderCircle, Mail, MessageCircle, Pencil, ShieldCheck, Users, X } from 'lucide-react';
import { addresses, publicClient, subgraphUrl, type ChamaDeployment } from '../src/config/contracts';
import { chamaDirectoryAbi } from '../src/abi/ChamaDirectory';
import { membershipRegistryAbi } from '../src/abi/MembershipRegistry';
import { ensureWalletNetwork } from '../src/config/networkActions';
import { buildInviteShareLinks } from './inviteShareLinks';
import { normalizeChamaName } from '../src/config/chamaNameCore';
import { loadPendingJoinRequests, type PendingJoinRequest } from '../src/config/pendingJoinRequestsCore';

export function ChamaOwnerTools({ chama, isMember, onMembershipUpdated, onNameUpdated }: { chama: ChamaDeployment; isMember: boolean; onMembershipUpdated: () => void; onNameUpdated: (deployment: ChamaDeployment) => void }) {
  const { primaryWallet } = useDynamicContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(chama.name);
  const [pendingRequests, setPendingRequests] = useState<PendingJoinRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const requestRefreshInFlight = useRef(false);
  const isOwner = primaryWallet?.address?.toLowerCase() === chama.owner.toLowerCase();

  const refreshPendingRequests = useCallback(async () => {
    if (!isOwner || requestRefreshInFlight.current) return;
    requestRefreshInFlight.current = true;
    setLoadingRequests(true);
    setError('');
    try {
      setPendingRequests(await loadPendingJoinRequests(subgraphUrl, chama.chamaId));
    } catch (cause) {
      setError(cause instanceof Error ? `Could not load pending join requests: ${cause.message}` : 'Could not load pending join requests.');
    } finally {
      setLoadingRequests(false);
      requestRefreshInFlight.current = false;
    }
  }, [chama.chamaId, isOwner]);

  useEffect(() => {
    setPendingRequests([]);
  }, [chama.chamaId]);

  useEffect(() => {
    if (!isOwner) return;
    void refreshPendingRequests();
    const interval = window.setInterval(() => void refreshPendingRequests(), 60_000);
    return () => window.clearInterval(interval);
  }, [isOwner, refreshPendingRequests]);

  async function transact(action: 'enable-membership' | 'create-invite' | 'rename-chama' | 'approve-join' | 'reject-join', applicant?: Address) {
    if (!primaryWallet || !isEthereumWallet(primaryWallet) || !isOwner) return;
    setBusy(true);
    setError('');
    setInviteUrl('');
    setCopied(false);
    try {
      await ensureWalletNetwork(primaryWallet, publicClient.chain.id);
      const client = await primaryWallet.getWalletClient();
      if (client.chain?.id !== publicClient.chain?.id) throw new Error('Wallet is not on the configured network.');

      if (action === 'approve-join' || action === 'reject-join') {
        if (!applicant) throw new Error('Select a join request first.');
        const approved = action === 'approve-join';
        const hash = await client.writeContract({
          address: addresses.directory,
          abi: chamaDirectoryAbi,
          functionName: 'approveJoin',
          args: [chama.chamaId, applicant, approved],
          chain: client.chain,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') throw new Error(`Join request ${approved ? 'approval' : 'rejection'} transaction reverted.`);
        setPendingRequests(current => current.filter(request => request.applicant.toLowerCase() !== applicant.toLowerCase()));
        await refreshPendingRequests();
      } else if (action === 'rename-chama') {
        const nextName = normalizeChamaName(name);
        const hash = await client.writeContract({
          address: addresses.directory,
          abi: chamaDirectoryAbi,
          functionName: 'setChamaName',
          args: [chama.chamaId, nextName],
          chain: client.chain,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') throw new Error('Chama rename transaction reverted.');
        const raw = await publicClient.readContract({ address: addresses.directory, abi: chamaDirectoryAbi, functionName: 'chamas', args: [chama.chamaId] });
        const entry = raw as readonly [Address, Address, Address, Address, Address, Address, string, string, boolean, boolean];
        if (entry[0].toLowerCase() !== chama.owner.toLowerCase() || entry[6] !== nextName) throw new Error('Rename confirmed, but the directory did not return the updated chama name.');
        onNameUpdated({ ...chama, name: entry[6] });
        setName(entry[6]);
        setEditingName(false);
      } else if (action === 'enable-membership') {
        const hash = await client.writeContract({
          address: chama.registry,
          abi: membershipRegistryAbi,
          functionName: 'setMember',
          args: [primaryWallet.address as Address, true],
          chain: client.chain,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') throw new Error('Owner membership transaction reverted.');
        onMembershipUpdated();
      } else {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        const code = `CHAMA-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
        const codeHash = keccak256(stringToHex(code));
        const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);
        const maxUses = BigInt(100);
        const hash = await client.writeContract({
          address: addresses.directory,
          abi: chamaDirectoryAbi,
          functionName: 'createInvite',
          args: [chama.chamaId, codeHash, expiresAt, maxUses],
          chain: client.chain,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') throw new Error('Invite creation transaction reverted.');
        const storedInvite = await publicClient.readContract({
          address: addresses.directory,
          abi: chamaDirectoryAbi,
          functionName: 'invites',
          args: [codeHash],
        }) as readonly [bigint, bigint, bigint, bigint, boolean];
        if (storedInvite[0] !== chama.chamaId || !storedInvite[4]) throw new Error('Invite transaction confirmed, but the directory did not return an active invite for this chama.');
        setInviteUrl(`${window.location.origin}/join/${encodeURIComponent(code)}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Owner action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      setError('Could not copy automatically. Select and copy the invite link.');
    }
  }

  if (!isOwner) return null;

  return <section className="section">
    <div className="section-head"><h2 className="section-title">Chama owner tools</h2><span className="pill">Owner</span></div>
    <div className="card flow-form">
      {!isMember && <div className="owner-action-row">
        <div className="owner-action-copy"><ShieldCheck size={19}/><div><strong>Activate your membership</strong><p className="muted">This wallet owns the chama but is not in its member registry yet. Approve your owner wallet so deposits are enabled.</p></div></div>
        <button className="primary" disabled={busy} onClick={() => void transact('enable-membership')}>{busy ? <LoaderCircle className="spin" size={16}/> : 'Approve my wallet'}</button>
      </div>}
      <div className="owner-action-row">
        <div className="owner-action-copy"><Pencil size={19}/><div><strong>Chama name</strong><p className="muted">Current name: {chama.name || 'Unnamed chama'}</p></div></div>
        {!editingName && <button className="secondary" onClick={() => { setName(chama.name); setEditingName(true); }}>Change name</button>}
      </div>
      {editingName && <div className="owner-action-row owner-name-editor">
        <label className="field-label" htmlFor="owner-chama-name">New chama name</label>
        <input id="owner-chama-name" className="input" value={name} maxLength={64} onChange={event => setName(event.target.value)} />
        <button className="primary" disabled={busy || !name.trim() || name.trim() === chama.name} onClick={() => void transact('rename-chama')}>{busy ? <LoaderCircle className="spin" size={16}/> : 'Save name'}</button>
        <button className="secondary" disabled={busy} onClick={() => { setName(chama.name); setEditingName(false); }}>Cancel</button>
      </div>}
      <div className="owner-action-row">
        <div className="owner-action-copy"><Users size={19}/><div><strong>Pending join requests</strong><p className="muted">Review wallets that requested to join using an invite.</p></div></div>
        <button className="secondary" onClick={() => void refreshPendingRequests()} disabled={loadingRequests}>{loadingRequests ? <LoaderCircle className="spin" size={16}/> : 'Refresh requests'}</button>
      </div>
      {loadingRequests && pendingRequests.length === 0 && <p className="muted">Loading join requests…</p>}
      {!loadingRequests && pendingRequests.length === 0 && <p className="muted">No pending join requests.</p>}
      {pendingRequests.map(request => <div className="owner-action-row" key={request.applicant.toLowerCase()}>
        <div className="owner-action-copy"><Users size={18}/><div><strong>{request.applicant.slice(0, 6)}…{request.applicant.slice(-4)}</strong><p className="muted">Requested {new Date(Number(request.createdAt) * 1000).toLocaleString()}</p></div></div>
        <button className="primary" disabled={busy} onClick={() => void transact('approve-join', request.applicant)}>{busy ? <LoaderCircle className="spin" size={16}/> : 'Approve'}</button>
        <button className="secondary" disabled={busy} onClick={() => void transact('reject-join', request.applicant)}>Reject</button>
      </div>)}
      <div className="owner-action-row">
        <div className="owner-action-copy"><Users size={19}/><div><strong>Invite members</strong><p className="muted">Share a private link, valid for 30 days and up to 100 join requests.</p></div></div>
        <button className="primary" onClick={() => { setShareOpen(true); if (!inviteUrl && !busy) void transact('create-invite'); }}><Users size={16}/> Invite</button>
      </div>
      {error && <p className="feedback error">{error}</p>}
    </div>
    {shareOpen && <InviteShareModal inviteUrl={inviteUrl} busy={busy} error={error} copied={copied} onCreate={() => void transact('create-invite')} onCopy={() => void copyInvite()} onClose={() => setShareOpen(false)}/>}
  </section>;
}

function InviteShareModal({ inviteUrl, busy, error, copied, onCreate, onCopy, onClose }: { inviteUrl: string; busy: boolean; error: string; copied: boolean; onCreate: () => void; onCopy: () => void; onClose: () => void }) {
  const links = inviteUrl ? buildInviteShareLinks(inviteUrl) : null;
  return <div className="share-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="share-modal" role="dialog" aria-modal="true" aria-labelledby="share-modal-title">
      <button className="share-modal-close" aria-label="Close share dialog" onClick={onClose}><X size={19}/></button>
      <span className="share-modal-icon"><Users size={22}/></span>
      <h2 id="share-modal-title">Invite people to your chama</h2>
      <p className="muted">Share a private invite link. It expires in 30 days or after 100 requests.</p>
      {inviteUrl && links ? <>
        <div className="share-link-field"><span>{inviteUrl}</span><button className="secondary" onClick={onCopy}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Copied' : 'Copy'}</button></div>
        <div className="share-options">
          <a className="share-option whatsapp" href={links.whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={19}/> WhatsApp</a>
          <a className="share-option email" href={links.email}><Mail size={19}/> Email</a>
          <a className="share-option x-share" href={links.x} target="_blank" rel="noreferrer"><X size={19}/> Share on X</a>
        </div>
      </> : <div className="share-modal-pending">{busy ? <><LoaderCircle className="spin" size={19}/> Creating your invite on Arc…</> : <><p>Your secure invite link hasn’t been created yet.</p><button className="primary" onClick={onCreate}>Create invite link</button></>}</div>}
      {error && <p className="feedback error">{error}</p>}
      <p className="muted share-modal-note">Invitees still need owner approval before they become members.</p>
    </section>
  </div>;
}
