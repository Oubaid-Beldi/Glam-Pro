import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { SignInScreen } from '@/components/SignInScreen'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { ProjectsProvider } from '@/lib/projects-context'
import Dashboard from '@/pages/Dashboard'
import Projects from '@/pages/Projects'
import Tasks from '@/pages/Tasks'
import Notes from '@/pages/Notes'
import Marketing from '@/pages/Marketing'
import Calendar from '@/pages/Calendar'

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  )
}

function AuthGate() {
  const { user, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!user) return <SignInScreen />

  return (
    <ProjectsProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="projects" element={<Projects />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="notes" element={<Notes />} />
            <Route path="marketing" element={<Marketing />} />
            <Route path="calendar" element={<Calendar />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ProjectsProvider>
  )
}

function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  )
}

export default App
