import React, { useState } from 'react';
import { Language, translations } from '../i18n/translations';
import { CharacterItem } from '../lib/api';
import { Plus, User, CheckCircle2, Trash2 } from 'lucide-react';

interface CharacterSidebarProps {
  lang: Language;
  disabled?: boolean;
  characters: CharacterItem[];
  selectedChar: CharacterItem | null;
  onSelectCharacter: (char: CharacterItem) => void;
  onCreateCharacter: (char: { name: string; voice_description: string; sample_text: string; tags: string }) => Promise<void>;
  onDeleteCharacter: (id: number) => void;
}

export const CharacterSidebar: React.FC<CharacterSidebarProps> = ({
  lang,
  disabled = false,
  characters,
  selectedChar,
  onSelectCharacter,
  onCreateCharacter,
  onDeleteCharacter
}) => {
  const t = translations[lang];
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sampleText, setSampleText] = useState('');
  const [tags, setTags] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || disabled || isSaving) return;
    setIsSaving(true);
    try {
    await onCreateCharacter({
      name,
      voice_description: description,
      sample_text: sampleText || t.defaultCharSampleText,
      tags
    });
    setName('');
    setDescription('');
    setSampleText('');
    setTags('');
    setIsCreating(false);
    } catch { /* Keep the draft visible; the API error is shown by the app. */ }
    finally { setIsSaving(false); }
  };

  return (
    <aside className="w-72 border-r border-black/[0.06] dark:border-white/[0.08] apple-glass flex flex-col h-[calc(100vh-3.5rem)] select-none transition-colors">
      {/* 标题与新建按钮 */}
      <div className="p-4 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <User className="w-4 h-4 text-apple-gray-500 dark:text-apple-gray-300" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-apple-gray-500 dark:text-apple-gray-300">
            {t.characters}
          </h2>
        </div>
        <button
          disabled={disabled || isSaving}
          onClick={() => setIsCreating(!isCreating)}
          className="p-1 rounded-md apple-glass-interactive text-apple-gray-600 dark:text-apple-gray-300 hover:text-apple-gray-900 dark:hover:text-white"
          title={t.newCharacter}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* 新建角色面板（折叠抽屉） */}
      {isCreating && (
        <form onSubmit={handleSubmit} className="p-3 border-b border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] space-y-2.5">
          <div>
            <input
              type="text"
              required
              maxLength={100}
              aria-label={t.characterNamePlaceholder}
              placeholder={t.characterNamePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-sm px-2.5 py-1.5 rounded-lg bg-white/80 dark:bg-black/40 border border-black/10 dark:border-white/10 text-apple-gray-900 dark:text-white placeholder-apple-gray-400 dark:placeholder-apple-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <textarea
              rows={2}
              required
              maxLength={2000}
              aria-label={t.voiceDescriptionPlaceholder}
              placeholder={t.voiceDescriptionPlaceholder}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-sm px-2.5 py-1.5 rounded-lg bg-white/80 dark:bg-black/40 border border-black/10 dark:border-white/10 text-apple-gray-900 dark:text-white placeholder-apple-gray-400 dark:placeholder-apple-gray-500 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
          <div>
            <input
              type="text"
              maxLength={5000}
              aria-label={t.sampleTextPlaceholder}
              placeholder={t.sampleTextPlaceholder}
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
              className="w-full text-sm px-2.5 py-1.5 rounded-lg bg-white/80 dark:bg-black/40 border border-black/10 dark:border-white/10 text-apple-gray-900 dark:text-white placeholder-apple-gray-400 dark:placeholder-apple-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex justify-end space-x-2 pt-1">
            <button
          disabled={disabled}
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-2.5 py-1 rounded-md text-xs text-apple-gray-500 hover:text-apple-gray-900 dark:text-apple-gray-300 dark:hover:text-white"
            >
              {t.close}
            </button>
            <button
          disabled={disabled || isSaving}
              type="submit"
              className="px-3 py-1 rounded-md text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-apple-sm"
            >
              {t.saveCharacter}
            </button>
          </div>
        </form>
      )}

      {/* 角色列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {characters.length === 0 ? (
          <div className="p-6 text-center text-apple-gray-500 text-xs">
            {t.noCharacters}
          </div>
        ) : (
          characters.map((char) => {
            const isSelected = selectedChar?.id === char.id;
            return (
              <div
                key={char.id}
                className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-start justify-between group ${
                  isSelected
                    ? 'bg-blue-600/10 dark:bg-blue-600/20 border border-blue-500/40 shadow-apple-sm'
                    : 'apple-glass-card hover:bg-black/[0.03] dark:hover:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.05]'
                }`}
              >
                <button type="button" disabled={disabled} onClick={() => onSelectCharacter(char)} className="flex items-start space-x-2.5 min-w-0 flex-1 text-left">
                  <span className="text-xl select-none leading-none pt-0.5">{char.avatar || '🎙️'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-medium text-xs text-apple-gray-900 dark:text-white truncate">{char.name}</span>
                      {char.pinned_clip && (
                        <span title={t.activeVoice} className="flex-shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-apple-gray-500 dark:text-apple-gray-300 truncate mt-0.5">
                      {char.voice_description}
                    </p>
                  </div>
                </button>

                <button
          disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteCharacter(char.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-apple-gray-500 hover:text-red-500 dark:text-apple-gray-300 dark:hover:text-red-400 transition-opacity"
                  title={t.deleteCharacter}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
