import { useState } from 'react';
import { createModel } from '../../actions';

export function NewModelDialog({ close }: { close: () => void }) {
  const [name, setName] = useState('Новая модель');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        createModel(name);
      }}
    >
      <h2>Новая модель</h2>
      <p className="modal-text">В модели есть все виды диаграмм: IDEF0, DFD, IDEF3, BPMN, EPC, пять диаграмм UML и ERD. Переключайтесь между ними вверху окна.</p>
      <label className="field">
        <span className="field-label">Название</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus onFocus={(e) => e.target.select()} />
      </label>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={close}>
          Отмена
        </button>
        <button type="submit" className="btn primary">
          Создать
        </button>
      </div>
    </form>
  );
}
