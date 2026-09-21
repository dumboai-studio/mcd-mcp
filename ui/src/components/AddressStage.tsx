import type { App } from "@modelcontextprotocol/ext-apps";
import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import type { Address, Store } from "../../../shared/types.js";
import { api, type CreateAddressInput } from "../api.js";
import { Empty, ErrorBox, Skeleton } from "./common.js";

const EMPTY_FORM: CreateAddressInput = { city: "", contactName: "", gender: "", phone: "", address: "", addressDetail: "" };

export function AddressStage({
  app,
  addresses,
  onAddresses,
  onChosen,
  onBack,
}: {
  app: App;
  addresses: Address[] | null;
  onAddresses: (list: Address[]) => void;
  onChosen: (address: Address, stores: Store[]) => void;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateAddressInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      onAddresses(await api.queryAddresses(app));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [app, onAddresses]);

  useEffect(() => {
    if (addresses === null) void load();
  }, [addresses, load]);

  const choose = async (address: Address) => {
    setSelecting(address.addressId);
    setError(null);
    try {
      const stores = await api.queryDeliveryStores(app, address.addressId, 2);
      onChosen(address, stores);
    } catch (e) {
      setError(e);
    } finally {
      setSelecting(null);
    }
  };

  // 不用 <form>：宿主 iframe 沙箱通常没有 allow-forms，原生提交会被拦截
  const save = async () => {
    if (saving) return;
    setFormError(null);
    if (!/^\d{11}$/.test(form.phone.trim())) {
      setFormError(new Error("手机号需为 11 位数字"));
      return;
    }
    for (const [k, label] of [["city", "城市"], ["contactName", "联系人"], ["address", "地址"], ["addressDetail", "门牌号"]] as const) {
      if (!form[k].trim()) {
        setFormError(new Error(`请填写${label}`));
        return;
      }
    }
    setSaving(true);
    try {
      const created = await api.createAddress(app, {
        city: form.city.trim(),
        contactName: form.contactName.trim(),
        gender: form.gender?.trim() || undefined,
        phone: form.phone.trim(),
        address: form.address.trim(),
        addressDetail: form.addressDetail.trim(),
      });
      onAddresses([...(addresses ?? []), created]);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      setFormError(err);
    } finally {
      setSaving(false);
    }
  };

  const onEnter = (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  };
  const field = (k: keyof CreateAddressInput) => ({
    value: form[k] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value }),
    onKeyDown: onEnter,
  });

  return (
    <div className="stage">
      <div className="stage-head">
        <button className="btn ghost small" onClick={onBack}>
          ← 返回
        </button>
        <h2 className="stage-title">选择配送地址</h2>
      </div>
      {loading && addresses === null && <Skeleton rows={2} />}
      <ErrorBox error={error} onRetry={addresses === null ? load : undefined} />
      {addresses && addresses.length === 0 && !loading && <Empty>还没有配送地址，请先新增。</Empty>}
      <ul className="card-list">
        {(addresses ?? []).map((a) => (
          <li key={a.addressId} className="card">
            <div className="card-main">
              <div className="card-title">
                {a.contactName ?? "联系人"} <span className="muted">{a.phone}</span>
              </div>
              <div className="muted">{a.fullAddress}</div>
            </div>
            <button className="btn primary small" disabled={selecting !== null} onClick={() => void choose(a)}>
              {selecting === a.addressId ? "查询门店…" : "送到这里"}
            </button>
          </li>
        ))}
      </ul>

      {showForm ? (
        <div className="panel">
          <h3 className="panel-title">新增配送地址</h3>
          <div className="form-row">
            <label>
              城市 <input {...field("city")} placeholder="如：北京市" />
            </label>
            <label>
              联系人 <input {...field("contactName")} placeholder="姓名" />
            </label>
          </div>
          <div className="form-row">
            <label>
              称呼
              <select {...field("gender")}>
                <option value="">不填</option>
                <option value="先生">先生</option>
                <option value="女士">女士</option>
              </select>
            </label>
            <label>
              手机号 <input {...field("phone")} inputMode="numeric" maxLength={11} placeholder="11 位数字" />
            </label>
          </div>
          <label>
            地址 <input {...field("address")} placeholder="小区 / 写字楼，如：清竹园 9 号楼" />
          </label>
          <label>
            门牌号 <input {...field("addressDetail")} placeholder="如：2 单元 508" />
          </label>
          <ErrorBox error={formError} compact />
          <div className="btn-row">
            <button className="btn primary" type="button" disabled={saving} onClick={() => void save()}>
              {saving ? "保存中…" : "保存地址"}
            </button>
            <button className="btn" type="button" onClick={() => setShowForm(false)}>
              取消
            </button>
          </div>
        </div>
      ) : (
        <button className="btn" onClick={() => setShowForm(true)}>
          + 新增地址
        </button>
      )}
    </div>
  );
}
