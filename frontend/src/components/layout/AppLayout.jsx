import React from "react";
import { Routes, Route } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Error404 from "../../pages/Error404";

// Pages
import Dashboard from "../../pages/Dashboard";
import EmailHistory from "../EmailHistory";
import EmailProcessor from "../../pages/EmailProcessor";
import FileAnalyzer from "../FileAnalyzer";
import TenantFilesPanel from "../TenantFilesPanel";
import SettingsPanel from "../SettingsPanel";
import AccountPage from "../../pages/AccountPage";

export default function AppLayout({ authFetch, onLogout }) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface-bg">
      <Sidebar onLogout={onLogout} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header />

        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/dashboard" element={<Dashboard authFetch={authFetch} />} />
            <Route path="/emails/history" element={<EmailHistory authFetch={authFetch} />} />
            <Route path="/emails/analyze" element={<EmailProcessor authFetch={authFetch} />} />
            <Route path="/documents" element={<FileAnalyzer authFetch={authFetch} />} />
            <Route path="/tenant-files" element={<TenantFilesPanel authFetch={authFetch} />} />
            <Route path="/settings" element={<SettingsPanel authFetch={authFetch} />} />
            <Route path="/account" element={<AccountPage authFetch={authFetch} />} />
            <Route path="*" element={<Error404 />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
