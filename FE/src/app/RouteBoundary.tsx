import { Component, Suspense, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function RouteLoading() {
  const { t } = useTranslation();
  return <div role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><Spinner aria-hidden="true" />{t("routes.loading")}</div>;
}

function RouteFailure() {
  const { t } = useTranslation();
  return <div className="mx-auto max-w-md space-y-4 p-6">
    <p role="alert" className="text-base font-medium">{t("routes.failed")}</p>
    <p className="text-sm leading-6 text-muted-foreground">{t("routes.reloadHint")}</p>
    <div className="flex flex-wrap gap-2"><Button className="h-11" onClick={() => window.location.reload()}>{t("routes.reload")}</Button><Button className="h-11" variant="outline" asChild><Link to="/dashboard">{t("invitation.back")}</Link></Button></div>
  </div>;
}

type BoundaryProps = { children: ReactNode; routeKey: string };
type BoundaryState = { failed: boolean; routeKey: string };

class RouteErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state = { failed: false, routeKey: this.props.routeKey };
  static getDerivedStateFromError() { return { failed: true }; }
  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState) {
    return props.routeKey !== state.routeKey ? { failed: false, routeKey: props.routeKey } : null;
  }
  render() { return this.state.failed ? <RouteFailure /> : this.props.children; }
}

export function RouteBoundary({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const location = useLocation();
  return <RouteErrorBoundary routeKey={location.key}><Suspense fallback={fallback ?? <RouteLoading />}>{children}</Suspense></RouteErrorBoundary>;
}
