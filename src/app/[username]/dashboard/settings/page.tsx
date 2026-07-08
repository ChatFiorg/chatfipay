'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Store = {
  username: string;
  name: string;
  description: string;
  logo: string;
  template: string;
  category: string;
  contact: { paymentMethod?: string; [k: string]: any };
  shipping: { flatFee: number; freeThreshold: number | null; pickupEnabled: boolean; pickupAddress: string };
  loyalty: { enabled: boolean; earnRate: number; redeemValue: number };
  live: boolean;
};

const TEMPLATES = [
  { id: 'clean', label: 'Clean' },
  { id: 'dark', label: 'Dark' },
  { id: 'combo', label: 'Combo' },
  { id: 'ministore', label: 'Mini Store' },
];

async function saveStoreField(username: string, patch: Record<string, any>) {
  const res = await fetch('/api/stores/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, ...patch }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export default function SettingsPage() {
  const { username } = useParams<{ username: string }>();
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/stores/${username}`)
      .then((r) => r.json())
      .then((data) => { if (!data.error) setStore(data); })
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) return <p className="text-muted text-sm text-center py-10">Loading...</p>;
  if (!store) return <p className="text-muted text-sm text-center py-10">Store not found.</p>;

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Settings</h1>
      <SettingsSections username={username} store={store} onUpdate={setStore} />
    </div>
  );
}

export function SettingsSections({ username, store, onUpdate }: { username: string; store: Store; onUpdate: (s: Store) => void }) {
  const [name, setName] = useState(store.name || '');
  const [description, setDescription] = useState(store.description || '');
  const [template, setTemplate] = useState(store.template || 'clean');
  const [paymentMethod, setPaymentMethod] = useState(store.contact?.paymentMethod || 'both');

  const [flatFee, setFlatFee] = useState(String(store.shipping?.flatFee ?? 0));
  const [freeThreshold, setFreeThreshold] = useState(store.shipping?.freeThreshold != null ? String(store.shipping.freeThreshold) : '');
  const [pickupEnabled, setPickupEnabled] = useState(!!store.shipping?.pickupEnabled);
  const [pickupAddress, setPickupAddress] = useState(store.shipping?.pickupAddress || '');

  const [loyaltyEnabled, setLoyaltyEnabled] = useState(!!store.loyalty?.enabled);
  const [earnRate, setEarnRate] = useState(String(store.loyalty?.earnRate ?? 1));
  const [redeemValue, setRedeemValue] = useState(String(store.loyalty?.redeemValue ?? 1));

  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const withSave = async (key: string, patch: Record<string, any>, localUpdate: Partial<Store>) => {
    setSavingKey(key);
    setMessage('');
    try {
      await saveStoreField(username, patch);
      onUpdate({ ...store, ...localUpdate });
      setMessage('Saved');
      setTimeout(() => setMessage(''), 2000);
    } catch (e: any) {
      setMessage(e.message || 'Failed to save');
    } finally {
      setSavingKey(null);
    }
  };

  const inputClass = "w-full py-2.5 px-3.5 rounded-lg bg-bg border border-border text-text text-sm outline-none focus:border-accent mt-1";
  const labelClass = "text-xs font-bold text-muted";
  const sectionClass = "mb-7 pb-6 border-b border-border scroll-mt-20";
  const btnClass = (busy: boolean) =>
    `mt-3 py-2.5 px-4 rounded-full text-xs font-bold transition-opacity ${
      busy ? 'opacity-50' : 'hover:opacity-90'
    } bg-accent text-accent-text`;

  return (
    <div>
      {message && (
        <p className={`text-xs mb-4 ${message === 'Saved' ? 'text-accent' : 'text-red-400'}`}>{message}</p>
      )}

      <div id="settings-info" className={sectionClass}>
        <h3 className="text-sm font-bold mb-3">Store info</h3>
        <label className={labelClass}>Name</label>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        <label className={`${labelClass} block mt-3`}>Description</label>
        <textarea className={`${inputClass} resize-none`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        <button
          className={btnClass(savingKey === 'info')}
          disabled={savingKey === 'info'}
          onClick={() => withSave('info', { name, description }, { name, description })}
        >
          {savingKey === 'info' ? 'Saving...' : 'Save info'}
        </button>
      </div>

      <div id="settings-template" className={sectionClass}>
        <h3 className="text-sm font-bold mb-3">Template</h3>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTemplate(t.id)}
              className={`py-2.5 rounded-lg text-sm font-bold transition-colors border ${
                template === t.id ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-bg text-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          className={btnClass(savingKey === 'template')}
          disabled={savingKey === 'template'}
          onClick={() => withSave('template', { name, description, category: store.category, template, contact: store.contact || {} }, { template })}
        >
          {savingKey === 'template' ? 'Saving...' : 'Save template'}
        </button>
      </div>

      <div id="settings-payment" className={sectionClass}>
        <h3 className="text-sm font-bold mb-3">Accept payments in</h3>
        <div className="grid grid-cols-3 gap-2">
          {[{ id: 'naira', label: 'Naira' }, { id: 'usdc', label: 'USDC' }, { id: 'both', label: 'Both' }].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setPaymentMethod(opt.id)}
              className={`py-2.5 rounded-full text-xs font-bold transition-colors border ${
                paymentMethod === opt.id ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-bg text-text'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          className={btnClass(savingKey === 'payment')}
          disabled={savingKey === 'payment'}
          onClick={() => withSave('payment', { contact: { ...store.contact, paymentMethod } }, { contact: { ...store.contact, paymentMethod } })}
        >
          {savingKey === 'payment' ? 'Saving...' : 'Save payment method'}
        </button>
      </div>

      <div id="settings-shipping" className={sectionClass}>
        <h3 className="text-sm font-bold mb-3">Shipping</h3>
        <label className={labelClass}>Flat fee (₦)</label>
        <input className={inputClass} type="number" value={flatFee} onChange={(e) => setFlatFee(e.target.value)} />
        <label className={`${labelClass} block mt-3`}>Free shipping above (₦, optional)</label>
        <input className={inputClass} type="number" value={freeThreshold} onChange={(e) => setFreeThreshold(e.target.value)} />
        <label className="flex items-center gap-2 mt-3 text-sm text-text">
          <input type="checkbox" checked={pickupEnabled} onChange={(e) => setPickupEnabled(e.target.checked)} />
          Enable pickup
        </label>
        {pickupEnabled && (
          <>
            <label className={`${labelClass} block mt-2`}>Pickup address</label>
            <input className={inputClass} value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} />
          </>
        )}
        <button
          className={btnClass(savingKey === 'shipping')}
          disabled={savingKey === 'shipping'}
          onClick={() => {
            const shipping = {
              flatFee: flatFee ? Number(flatFee) : 0,
              freeThreshold: freeThreshold ? Number(freeThreshold) : null,
              pickupEnabled,
              pickupAddress: pickupAddress.trim(),
            };
            withSave('shipping', { shipping }, { shipping });
          }}
        >
          {savingKey === 'shipping' ? 'Saving...' : 'Save shipping'}
        </button>
      </div>

      <div id="settings-loyalty" className="scroll-mt-20">
        <h3 className="text-sm font-bold mb-3">Loyalty rewards</h3>
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={loyaltyEnabled} onChange={(e) => setLoyaltyEnabled(e.target.checked)} />
          Enable loyalty points
        </label>
        {loyaltyEnabled && (
          <>
            <label className={`${labelClass} block mt-3`}>Points earned per ₦1 spent</label>
            <input className={inputClass} type="number" value={earnRate} onChange={(e) => setEarnRate(e.target.value)} />
            <label className={`${labelClass} block mt-3`}>₦ value per point redeemed</label>
            <input className={inputClass} type="number" value={redeemValue} onChange={(e) => setRedeemValue(e.target.value)} />
          </>
        )}
        <button
          className={btnClass(savingKey === 'loyalty')}
          disabled={savingKey === 'loyalty'}
          onClick={() => {
            const loyalty = {
              enabled: loyaltyEnabled,
              earnRate: earnRate ? Number(earnRate) : 1,
              redeemValue: redeemValue ? Number(redeemValue) : 1,
            };
            withSave('loyalty', { loyalty }, { loyalty });
          }}
        >
          {savingKey === 'loyalty' ? 'Saving...' : 'Save loyalty'}
        </button>
      </div>
    </div>
  );
}
