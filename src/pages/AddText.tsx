import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconClipboard, IconSparkle } from '../components/Icons';
import { Button, PageHeader, toast } from '../components/ui';
import { createDraft } from '../lib/recipeActions';
import { S } from '../strings.he';

const DRAFT_KEY = 'rn-paste-draft';

export default function AddText() {
  const navigate = useNavigate();
  const [text, setTextState] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_KEY) ?? '';
    } catch {
      return '';
    }
  });

  // Unsent text is kept so closing the app mid-paste loses nothing.
  const setText = (v: string) => {
    setTextState(v);
    try {
      localStorage.setItem(DRAFT_KEY, v);
    } catch {
      // ignore
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setText(text ? `${text}\n${t}` : t);
    } catch {
      // Permission denied: the user can long-press and paste manually.
    }
  };

  const convert = async () => {
    if (text.trim().length < 15) {
      toast(S.paste.tooShort);
      return;
    }
    const id = await createDraft({ status: 'pending', text: text.trim() });
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    navigate(`/process/${id}`, { replace: true });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <PageHeader title={S.paste.title} />
      <div className="flex flex-1 flex-col gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={S.paste.placeholder}
          aria-label={S.paste.title}
          autoFocus
          className="ctl-input min-h-[50dvh] flex-1 resize-none rounded-card! p-4 text-lg shadow-soft"
        />
        {'clipboard' in navigator && 'readText' in navigator.clipboard && (
          <Button variant="secondary" onClick={() => void pasteFromClipboard()}>
            <IconClipboard size={20} /> {S.paste.pasteFromClipboard}
          </Button>
        )}
        <Button big onClick={() => void convert()} disabled={!text.trim()}>
          <IconSparkle size={22} />
          {S.paste.convert}
        </Button>
      </div>
    </div>
  );
}
