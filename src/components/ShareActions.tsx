import QRCode from "qrcode";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { postJson } from "../lib/api";

interface ShareResponse { id: string; url: string; expiresAt: string }

export function ShareActions({ archiveId, facts, hasReflection }: { archiveId: string; facts: { primary: { name: string; names: Readonly<Record<string, string>>; unicodeSymbol: string }; relating: { name: string; names: Readonly<Record<string, string>>; unicodeSymbol: string } }; hasReflection: boolean }) {
  const { t, i18n } = useTranslation();
  const [includeReflection, setIncludeReflection] = useState(hasReflection);
  const [share, setShare] = useState<ShareResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const create = async () => {
    setBusy(true); setMessage("");
    try { setShare(await postJson<ShareResponse>("/api/v1/shares", { archiveId, includeReflection })); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("common.error")); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    if (!share) return;
    await navigator.clipboard.writeText(share.url);
    setMessage(t("common.copyDone"));
  };
  const nativeShare = async () => {
    if (!share) return;
    if (navigator.share) await navigator.share({ title: "Yi · 易", url: share.url });
    else await copy();
  };
  const downloadImage = async () => {
    if (!share) return;
    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 1600;
    const context = canvas.getContext("2d");
    if (!context) return;
    const gradient = context.createLinearGradient(0, 0, 1080, 1600);
    gradient.addColorStop(0, "#f8f0e4"); gradient.addColorStop(1, "#e6cbb1");
    context.fillStyle = gradient; context.fillRect(0, 0, 1080, 1600);
    context.fillStyle = "rgba(255,255,255,.58)"; context.beginPath(); context.roundRect(70, 80, 940, 1440, 48); context.fill();
    context.fillStyle = "#372d27"; context.font = "56px Georgia"; context.fillText("Yi · 易", 130, 180);
    context.font = "180px Georgia"; context.fillText(facts.primary.unicodeSymbol, 130, 430); context.fillText(facts.relating.unicodeSymbol, 610, 430);
    context.font = "52px Georgia"; context.fillText(facts.primary.names[i18n.language] ?? facts.primary.name, 130, 530); context.fillText("→", 500, 530); context.fillText(facts.relating.names[i18n.language] ?? facts.relating.name, 610, 530);
    context.fillStyle = "#70645b"; context.font = "30px system-ui"; context.fillText(t("share.imageTagline"), 130, 650);
    const qrData = await QRCode.toDataURL(share.url, { width: 360, margin: 1, color: { dark: "#372d27", light: "#ffffff00" } });
    const image = new Image(); image.src = qrData; await image.decode(); context.drawImage(image, 360, 850, 360, 360);
    context.fillStyle = "#372d27"; context.font = "28px system-ui"; context.textAlign = "center"; context.fillText("yi.rich-tide.com", 540, 1280);
    context.fillStyle = "#8c7769"; context.font = "24px system-ui"; context.fillText(t("share.expires", { date: new Date(share.expiresAt).toLocaleDateString() }), 540, 1340);
    const link = document.createElement("a"); link.download = "yi-reading.png"; link.href = canvas.toDataURL("image/png"); link.click();
  };
  return <div className="share-actions glass-subpanel">
    <h3>{t("share.title")}</h3><p>{t("share.body")}</p>
    {!share ? <>
      <label className="check-row"><input type="checkbox" checked={includeReflection} disabled={!hasReflection} onChange={(event) => setIncludeReflection(event.target.checked)} /><span>{t("share.includeReflection")}</span></label>
      <button className="button secondary" disabled={busy} onClick={() => void create()}>{busy ? t("common.loading") : t("share.create")}</button>
    </> : <>
      <label className="field"><span>{t("share.url")}</span><input readOnly value={share.url} /></label>
      <div className="button-row wrap"><button className="button secondary" onClick={() => void copy()}>{t("share.copy")}</button><button className="button secondary" onClick={() => void nativeShare()}>{t("share.native")}</button><button className="button secondary" onClick={() => void downloadImage()}>{t("share.image")}</button></div>
    </>}
    {message && <p className="small-status">{message}</p>}
  </div>;
}
