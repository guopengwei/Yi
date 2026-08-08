import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Route, Routes } from "react-router-dom";
import { PageState } from "./components/FlowPrimitives";
import { Layout } from "./components/Layout";

const HomePage = lazy(async () => ({ default: (await import("./pages/HomePage")).HomePage }));
const ReadingPage = lazy(async () => ({ default: (await import("./pages/ReadingPage")).ReadingPage }));
const HistoryPage = lazy(async () => ({ default: (await import("./pages/HistoryPage")).HistoryPage }));
const ArchivePage = lazy(async () => ({ default: (await import("./pages/ArchivePage")).ArchivePage }));
const ChatPage = lazy(async () => ({ default: (await import("./pages/ChatPage")).ChatPage }));
const PublicSharePage = lazy(async () => ({ default: (await import("./pages/PublicSharePage")).PublicSharePage }));
const AuthPage = lazy(async () => ({ default: (await import("./pages/AuthPage")).AuthPage }));
const SettingsPage = lazy(async () => ({ default: (await import("./pages/SettingsPage")).SettingsPage }));
const HelpPage = lazy(async () => ({ default: (await import("./pages/HelpPage")).HelpPage }));
const ContactPage = lazy(async () => ({ default: (await import("./pages/ContactPage")).ContactPage }));
const AdminPage = lazy(async () => ({ default: (await import("./pages/AdminPage")).AdminPage }));
const PrivacyPage = lazy(async () => ({ default: (await import("./pages/LegalPage")).PrivacyPage }));
const TermsPage = lazy(async () => ({ default: (await import("./pages/LegalPage")).TermsPage }));

export function App() {
  return <Layout><Suspense fallback={<RouteFallback />}><Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/reading/:id" element={<ReadingPage />} />
    <Route path="/history" element={<HistoryPage />} />
    <Route path="/history/:id" element={<ArchivePage />} />
    <Route path="/chat/:id" element={<ChatPage />} />
    <Route path="/share/:token" element={<PublicSharePage />} />
    <Route path="/auth" element={<AuthPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="/help" element={<HelpPage />} />
    <Route path="/contact" element={<ContactPage />} />
    <Route path="/admin" element={<AdminPage />} />
    <Route path="/privacy" element={<PrivacyPage />} />
    <Route path="/terms" element={<TermsPage />} />
    <Route path="*" element={<HomePage />} />
  </Routes></Suspense></Layout>;
}

function RouteFallback() {
  const { t } = useTranslation();
  return <div className="page narrow"><PageState kind="loading" title={t("common.loadingTitle")} body={t("common.loading")} /></div>;
}
