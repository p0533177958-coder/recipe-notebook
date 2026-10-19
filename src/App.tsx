import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RingingOverlay } from './components/TimerUI';
import { Toaster } from './components/ui';
import { TimerProvider } from './hooks/timers';
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

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <TimerProvider>
        <Suspense fallback={<div className="min-h-dvh" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/recipe/:id" element={<RecipeIntro />} />
            <Route path="/cook/:id" element={<Cook />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/add/text" element={<AddText />} />
            <Route path="/add/images/:draftId" element={<ImagesPreview />} />
            <Route path="/process/:draftId" element={<Processing />} />
            <Route path="/edit/:draftId" element={<EditRecipe />} />
            <Route path="/share" element={<ShareReceive />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <RingingOverlay />
        <Toaster />
      </TimerProvider>
    </BrowserRouter>
  );
}
