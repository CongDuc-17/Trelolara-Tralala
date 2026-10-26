import "./App.css";
import { lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { NotFound } from "./pages/NotFound";
import { CardDetail } from "./pages/CardDetail";
import { Home } from "./pages/Home";
import { RequireSession } from "./features/auth/RequireSession";
import { RouteBoundary } from "./app/RouteBoundary";

const Login = lazy(() => import("./pages/Login").then(({ Login }) => ({ default: Login })));
const Register = lazy(() => import("./pages/Register").then(({ Register }) => ({ default: Register })));
const VerifyEmail = lazy(() => import("./components/VerifyEmail").then(({ VerifyEmail }) => ({ default: VerifyEmail })));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword").then(({ ForgotPassword }) => ({ default: ForgotPassword })));
const AppLayout = lazy(() => import("./components/layout/AppLayout").then(({ AppLayout }) => ({ default: AppLayout })));
const Dashboard = lazy(() => import("./pages/Dashboard").then(({ Dashboard }) => ({ default: Dashboard })));
const Projects = lazy(() => import("./pages/Projects").then(({ Projects }) => ({ default: Projects })));
const Archive = lazy(() => import("./pages/Archive").then(({ Archive }) => ({ default: Archive })));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail").then(({ ProjectDetail }) => ({ default: ProjectDetail })));
const Board = lazy(() => import("./pages/Board").then(({ Board }) => ({ default: Board })));
const Profile = lazy(() => import("./pages/Profile").then(({ Profile }) => ({ default: Profile })));
const InvitationPage = lazy(() => import("./pages/InvitationPage").then(({ InvitationPage }) => ({ default: InvitationPage })));
const TaskScreen = lazy(() => import("./features/discovery/TaskScreen").then(({ TaskScreen }) => ({ default: TaskScreen })));
const BoardSearch = lazy(() => import("./features/discovery/TaskScreen").then(({ BoardSearch }) => ({ default: BoardSearch })));

function App() {
  return (
    <RouteBoundary><Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route element={<RequireSession />}>
      <Route path="/invite/:scope/:token" element={<InvitationPage />} />
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/archived" element={<Archive />} />
        <Route path="/projects/:projectId" element={<ProjectDetail />} />
        <Route path="/my-work" element={<TaskScreen />}>
          <Route path="boards/:boardId/cards/:cardId" element={<CardDetail />} />
        </Route>
        <Route path="/boards/:boardId/search" element={<BoardSearch />}>
          <Route path="cards/:cardId" element={<CardDetail />} />
        </Route>
        <Route path="/boards/:boardId" element={<Board />}>
          {/* Nested route cho card detail modal */}
          <Route path="cards/:cardId" element={<CardDetail />} />
        </Route>
        <Route path="/me" element={<Profile />} />
      </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes></RouteBoundary>
  );
}

export default App;
