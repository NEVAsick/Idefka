import { getState, loadModel, markSaved, markUnsaved, setState, toast } from '../store';
import type { Model, Notation } from '../model/types';
import { newModel } from '../model/ops';
import { parseModel, serialize } from '../model/file';
import { NOTATIONS, NOTATION_LIST } from '../model/notation';
import { forgetFile, openFileDialog, openRecent, saveModelFile } from '../platform';

const AUTOSAVE_KEY = 'cloneapp:autosave';

const errorText = (error: unknown) => (error as Error).message;

function firstUsedNotation(model: Model): Notation {
  const used = (notation: Notation) => {
    const root = model.diagrams[model.roots[notation]];
    if (!root) return false;
    if (notation === 'idef0') return root.arrows.length > 0 || root.boxes.length > 1 || root.boxes.some((b) => b.child);
    return root.boxes.length > 0;
  };
  return NOTATION_LIST.find(used) ?? 'idef0';
}

function show(model: Model, filePath: string | null, notation: Notation) {
  loadModel(model, filePath, notation);
  setState({ nodeKind: NOTATIONS[notation].kinds[0] });
}

async function confirmDiscard(): Promise<boolean> {
  if (!getState().dirty) return true;
  const answer = await new Promise<'save' | 'discard' | 'cancel'>((resolve) => setState({ dialog: { kind: 'unsaved', resolve } }));
  setState({ dialog: null });
  if (answer === 'cancel') return false;
  if (answer === 'save') return save();
  return true;
}

export async function newFile() {
  if (await confirmDiscard()) setState({ dialog: { kind: 'new' } });
}

export function createModel(name: string) {
  forgetFile();
  const { model, diagramId } = getState();
  const notation = model.diagrams[diagramId]?.notation ?? 'idef0';
  show(newModel(name.trim() || 'Новая модель'), null, notation);
  setState({ dialog: null });
  clearAutosave();
}

export function openContent(content: string, name: string | null) {
  try {
    const model = parseModel(content);
    show(model, name, firstUsedNotation(model));
    clearAutosave();
  } catch (error) {
    toast(errorText(error));
  }
}

export async function openFile() {
  if (!(await confirmDiscard())) return;
  try {
    const file = await openFileDialog();
    if (file) openContent(file.content, file.name);
  } catch (error) {
    toast(`Не удалось открыть файл: ${errorText(error)}`);
  }
}

export async function openRecentFile(name: string) {
  if (!(await confirmDiscard())) return;
  try {
    const file = await openRecent(name);
    if (file) openContent(file.content, file.name);
    else toast(`Нет доступа к файлу «${name}». Откройте его через «Открыть…».`);
  } catch {
    toast(`Файл «${name}» не найден — возможно, его переместили или удалили.`);
  }
}

export async function save(saveAs = false): Promise<boolean> {
  const { model } = getState();
  try {
    const name = await saveModelFile(serialize(model), saveAs, model.meta.name || 'Модель');
    if (!name) return false;
    markSaved(model, name);
    clearAutosave();
    toast(`Сохранено: ${name}`);
    return true;
  } catch (error) {
    toast(`Не удалось сохранить: ${errorText(error)}`);
    return false;
  }
}

// Черновик в localStorage общий для всех вкладок, поэтому вкладка стирает его, только если сама и записала.
let draftWritten = false;

export function autosave() {
  const { dirty, filePath, model, diagramId } = getState();
  if (!dirty) {
    if (draftWritten) clearAutosave();
    return;
  }
  const draft = { filePath, model, notation: model.diagrams[diagramId]?.notation, t: Date.now() };
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(draft));
    draftWritten = true;
  } catch {
    return;
  }
}

function clearAutosave() {
  draftWritten = false;
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    return;
  }
}

export function restoreAutosave(): boolean {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (!saved) return false;
    const draft = JSON.parse(saved);
    const model = parseModel(JSON.stringify(draft.model));
    const notation: Notation = draft.notation && model.roots[draft.notation as Notation] ? draft.notation : firstUsedNotation(model);
    show(model, draft.filePath ?? null, notation);
    markUnsaved();
    draftWritten = true;
    toast('Восстановлен черновик. Чтобы записать его в файл, нажмите Ctrl+S.');
    return true;
  } catch {
    return false;
  }
}
