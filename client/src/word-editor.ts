/** Reusable word list editor component with add, remove, drag-reorder, and duplicate detection. */

export interface WordEditorCallbacks {
  /** Called whenever the word list changes (add, remove, reorder). */
  onChange?: (words: string[]) => void;
}

export interface WordEditorOptions {
  /** Container element to render into. */
  container: HTMLElement;
  /** Initial words to populate. */
  initialWords?: string[];
  /** Minimum word count (default 24). */
  minWords?: number;
  callbacks?: WordEditorCallbacks;
}

export interface WordEditor {
  /** Returns a copy of the current word list. */
  getWords(): string[];
  /** Returns the current word count. */
  getCount(): number;
  /** Returns whether the minimum word count is met. */
  isValid(): boolean;
  /** Shows an error message below the word list. */
  showError(message: string): void;
  /** Clears the error message. */
  clearError(): void;
  /** Replaces all words and re-renders. */
  setWords(words: string[]): void;
  /** Destroys the editor and clears the container. */
  destroy(): void;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function createWordEditor(options: WordEditorOptions): WordEditor {
  const { container, initialWords = [], minWords = 24, callbacks = {} } = options;
  const words: string[] = [...initialWords];
  let dragSrcIndex: number | null = null;
  let duplicateTimeout: ReturnType<typeof setTimeout> | null = null;

  function notifyChange(): void {
    callbacks.onChange?.([...words]);
  }

  function renderWordCount(): string {
    const below = words.length < minWords;
    const cls = `word-count ${below ? 'warning' : ''}`;
    const text = below
      ? `${words.length} Wörter — noch ${minWords - words.length} benötigt (min. ${minWords})`
      : `${words.length} Wörter — Minimum erreicht ✓`;
    return `<div class="${cls}" id="we-word-count">${text}</div>`;
  }

  function renderChips(): string {
    return words
      .map(
        (w, i) => `
        <div class="word-chip" data-index="${i}" draggable="true">
          <span class="word-chip-text">${escapeHtml(w)}</span>
          <button class="word-chip-remove" data-remove="${i}" title="Entfernen">✕</button>
        </div>`,
      )
      .join('');
  }

  function render(): void {
    container.innerHTML = `
      <div class="word-editor">
        <div class="word-input-row">
          <input class="form-input word-input" type="text" id="we-word-input" placeholder="Neues Wort eingeben…" maxlength="60" />
          <button class="primary word-add-btn" id="we-btn-add-word">+ Hinzufügen</button>
        </div>
        ${renderWordCount()}
        <div class="form-error hidden" id="we-words-error"></div>
        <div class="word-list" id="we-word-list">
          ${renderChips()}
        </div>
      </div>
    `;
    attachEvents();
  }

  function updateWordCountEl(): void {
    const el = container.querySelector<HTMLDivElement>('#we-word-count');
    if (!el) return;
    const below = words.length < minWords;
    el.className = `word-count ${below ? 'warning' : ''}`;
    el.textContent = below
      ? `${words.length} Wörter — noch ${minWords - words.length} benötigt (min. ${minWords})`
      : `${words.length} Wörter — Minimum erreicht ✓`;
  }

  function addWord(): void {
    const input = container.querySelector<HTMLInputElement>('#we-word-input')!;
    const val = input.value.trim();
    if (!val) return;

    // Duplicate detection: warn but allow
    const duplicate = words.some((w) => w.toLowerCase() === val.toLowerCase());
    if (duplicate) {
      const countEl = container.querySelector<HTMLDivElement>('#we-word-count')!;
      countEl.textContent = `Duplikat: "${val}" existiert bereits`;
      countEl.className = 'word-count warning';
      if (duplicateTimeout) clearTimeout(duplicateTimeout);
      duplicateTimeout = setTimeout(() => updateWordCountEl(), 2000);
    }

    words.push(val);
    render();
    notifyChange();
    container.querySelector<HTMLInputElement>('#we-word-input')!.focus();
  }

  function attachEvents(): void {
    const wordInput = container.querySelector<HTMLInputElement>('#we-word-input')!;
    const addBtn = container.querySelector<HTMLButtonElement>('#we-btn-add-word')!;

    wordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addWord();
      }
    });

    addBtn.addEventListener('click', addWord);

    // Remove word
    container.querySelector('#we-word-list')!.addEventListener('click', (e) => {
      const removeBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-remove]');
      if (!removeBtn) return;
      const idx = Number(removeBtn.dataset.remove);
      words.splice(idx, 1);
      render();
      notifyChange();
    });

    // Drag and drop reordering
    const wordList = container.querySelector<HTMLDivElement>('#we-word-list')!;

    wordList.addEventListener('dragstart', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('.word-chip');
      if (!chip) return;
      dragSrcIndex = Number(chip.dataset.index);
      chip.classList.add('dragging');
      e.dataTransfer!.effectAllowed = 'move';
    });

    wordList.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      const chip = (e.target as HTMLElement).closest<HTMLElement>('.word-chip');
      if (chip) chip.classList.add('drag-over');
    });

    wordList.addEventListener('dragleave', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('.word-chip');
      if (chip) chip.classList.remove('drag-over');
    });

    wordList.addEventListener('drop', (e) => {
      e.preventDefault();
      const chip = (e.target as HTMLElement).closest<HTMLElement>('.word-chip');
      if (!chip || dragSrcIndex === null) return;
      const dropIndex = Number(chip.dataset.index);
      if (dragSrcIndex === dropIndex) return;

      const [moved] = words.splice(dragSrcIndex, 1);
      words.splice(dropIndex, 0, moved);
      dragSrcIndex = null;
      render();
      notifyChange();
    });

    wordList.addEventListener('dragend', () => {
      dragSrcIndex = null;
      wordList.querySelectorAll('.dragging, .drag-over').forEach((el) => {
        el.classList.remove('dragging', 'drag-over');
      });
    });
  }

  // Initial render
  render();

  return {
    getWords: () => [...words],
    getCount: () => words.length,
    isValid: () => words.length >= minWords,
    showError(message: string): void {
      const el = container.querySelector<HTMLDivElement>('#we-words-error');
      if (!el) return;
      el.textContent = message;
      el.classList.remove('hidden');
    },
    clearError(): void {
      const el = container.querySelector<HTMLDivElement>('#we-words-error');
      if (!el) return;
      el.classList.add('hidden');
    },
    setWords(newWords: string[]): void {
      words.length = 0;
      words.push(...newWords);
      render();
    },
    destroy(): void {
      if (duplicateTimeout) clearTimeout(duplicateTimeout);
      container.innerHTML = '';
    },
  };
}
