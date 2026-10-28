import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { Layout } from './components/Layout'
import { LoadingRegion, Skeleton } from './components/ui'
import { AccessPage } from './pages/AccessPage'
import { CallbackPage } from './pages/CallbackPage'
import { CustomersPage } from './pages/CustomersPage'
import { SignInPage } from './pages/SignInPage'

// Chart pages load only when needed, so the chart library isn't part of the first download.
const OverviewPage = lazy(() => import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })))
const ProductsPage = lazy(() => import('./pages/RankingPages').then((m) => ({ default: m.ProductsPage })))
const CountriesPage = lazy(() => import('./pages/RankingPages').then((m) => ({ default: m.CountriesPage })))

function PageLoading() {
  return (
    <LoadingRegion label="Loading page">
      <Skeleton className="mb-6 h-10 w-64" />
      <Skeleton className="h-80 w-full" />
    </LoadingRegion>
  )
}

function NotFound() {
  return (
    <div className="card p-8 text-center">
      <h1 className="text-xl font-semibold text-ink">Page not found</h1>
      <p className="mt-2 text-sm text-ink-muted">That page does not exist in DataGuard.</p>
      <Link to="/overview" className="btn-primary mt-4">
        Go to the overview
      </Link>
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/callback" element={<CallbackPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/overview" element={<Suspense fallback={<PageLoading />}><OverviewPage /></Suspense>} />
        <Route path="/products" element={<Suspense fallback={<PageLoading />}><ProductsPage /></Suspense>} />
        <Route path="/countries" element={<Suspense fallback={<PageLoading />}><CountriesPage /></Suspense>} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/access" element={<AccessPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="/" element={<Navigate to="/overview" replace />} />
    </Routes>
  )
}
