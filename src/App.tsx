import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RingingOverlay } from './components/TimerUI';
import { toast, Toaster } from './components/ui';
import { TimerProvider } from './hooks/timers';
import { consumeJustUpdated, notifyRoute } from './lib/updates';
import { S } from './strings.he';
import Home from './pages/Home';
import RecipeIntro from './pages/RecipeIntro';
import Cook from './pages/Cook';

// Less frequently used screens are split out to keep the first load small.
const Settings = lazy(() => import('./pages/Settings'));
const AddText = lazy(() => import('./pages/AddText'));
const ImagesPreview = lazy(() => import('./pages/ImagesPreview'));
const Processing = lazy(() => import('./pages/Processing'));
const EditRecipe = lazy(() => import('./pages/EditRecipe'));
const ShareReceive = lazy(() => import('./pages/ShareReceive'));
const RecipePage = lazy(() => import('./pages/RecipePage'));

/** Lets a waiting update apply on the next safe screen, and confirms right after an update. */
function UpdateWatcher() {
  const { pathname } = useLocation();
  useEffect(() => notifyRoute(pathname), [pathname]);
  useEffect(() => {
    if (consumeJustUpdated()) toast(S.update.justUpdated);
  }, []);
  return null;
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <TimerProvider>
        <Suspense fallback={<div className="min-h-dvh" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/recipe/:id" element={<RecipeIntro />} />
            <Route path="/cook/:id" element={<Cook />} />
            <Route path="/page/:id" element={<RecipePage />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/add/text" element={<AddText />} />
            <Route path="/add/images/:draftId" element={<ImagesPreview />} />
            <Route path="/process/:draftId" element={<Processing />} />
            <Route path="/edit/:draftId" element={<EditRecipe />} />
            <Route path="/share" element={<ShareReceive />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <UpdateWatcher />
        <RingingOverlay />
        <Toaster />
      </TimerProvider>
    </BrowserRouter>
  );
}
