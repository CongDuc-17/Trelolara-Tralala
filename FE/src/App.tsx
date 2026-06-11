import "./App.css";

import { Routes, Route } from "react-router-dom";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { NotFound } from "./pages/NotFound";

import { Dashboard } from "./pages/Dashboard";
import { Board } from "./pages/Board";
import { ProjectDetail } from "./pages/ProjectDetail";
import { CardDetail } from "./pages/CardDetail";
import { AppLayout } from "./components/layout/AppLayout";
import { Profile } from "./pages/Profile";
import { VerifyEmail } from "./components/VerifyEmail";
import { ForgotPassword } from "./pages/ForgotPassword";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects/:projectId" element={<ProjectDetail />} />
        <Route path="/boards/:boardId" element={<Board />}>
          {/* Nested route cho card detail modal */}
          <Route path="cards/:cardId" element={<CardDetail />} />
        </Route>
        <Route path="/me" element={<Profile />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
