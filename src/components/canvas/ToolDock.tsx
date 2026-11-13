import type { ReactNode } from 'react';
import type { NodeKind, Notation } from '../../model/types';
import { KINDS, NOTATIONS } from '../../model/notation';
import { setState, type Tool } from '../../store';
import { decomposeSelected, goUp } from '../../actions';
import { Icon, KindIcon } from '../icons';

function kindShortcut(index: number) {
  if (index === 0) return 'B';
  if (index === 9) return '0';
  return index < 9 ? String(index + 1) : '';
}

interface ToolButtonProps {
  on: boolean;
  tip: string;
  onClick: () => void;
  children: ReactNode;
}

function ToolButton({ on, tip, onClick, children }: ToolButtonProps) {
  return (
    <button className={'tool' + (on ? ' on' : '')} data-tip={tip} onClick={onClick}>
      {children}
    </button>
  );
}

interface ToolDockProps {
  tool: Tool;
  notation: Notation;
  nodeKind: NodeKind;
  canGoUp: boolean;
}

export function ToolDock({ tool, notation, nodeKind, canGoUp }: ToolDockProps) {
  const kinds = NOTATIONS[notation].kinds;
  const decomposable = kinds.some((k) => KINDS[k].decomposable);

  return (
    <div className={'tool-dock no-canvas' + (kinds.length > 5 ? ' wide' : '')} onPointerDown={(e) => e.stopPropagation()}>
      <ToolButton on={tool === 'select'} tip="Выбор  V" onClick={() => setState({ tool: 'select' })}>
        <Icon.select />
      </ToolButton>
      {kinds.map((kind, i) => (
        <ToolButton
          key={kind}
          on={tool === 'node' && nodeKind === kind}
          tip={`${KINDS[kind].title}  ${kindShortcut(i)}`.trim()}
          onClick={() => setState({ tool: 'node', nodeKind: kind })}
        >
          <KindIcon kind={kind} />
        </ToolButton>
      ))}
      <ToolButton on={tool === 'arrow'} tip={`${NOTATIONS[notation].linkWord}  A`} onClick={() => setState({ tool: 'arrow' })}>
        <Icon.arrow />
      </ToolButton>
      <ToolButton on={tool === 'hand'} tip="Перемещение листа  H" onClick={() => setState({ tool: 'hand' })}>
        <Icon.hand />
      </ToolButton>
      {decomposable && (
        <>
          <div className="dock-sep" />
          <button className="tool" data-tip="Декомпозиция  D" onClick={() => decomposeSelected()}>
            <Icon.down />
          </button>
          <button className="tool" data-tip="На уровень выше  Alt+↑" disabled={!canGoUp} onClick={goUp}>
            <Icon.up />
          </button>
        </>
      )}
    </div>
  );
}

function hintText(notation: Notation, root: boolean, empty: boolean): ReactNode {
  if (empty) {
    return (
      <>
        <b>Выберите элемент на панели слева и щёлкните по листу</b>, чтобы добавить его. Потом соединяйте элементы, перетаскивая точки на их краях.
      </>
    );
  }
  if (notation === 'idef0') {
    return (
      <>
        <b>Наведите на работу и потяните от цветной точки</b> — так рисуется стрелка. Слева вход, сверху управление, справа выход, снизу механизм.
        {root ? ' Стрелки к границе листа станут граничными для декомпозиции.' : ' Инструментом «Стрелка» (A) можно начать ветвь прямо от другой стрелки.'}
      </>
    );
  }
  if (NOTATIONS[notation].hint) return NOTATIONS[notation].hint;
  if (notation === 'bpmn') {
    return (
      <>
        <b>Наведите на элемент и потяните от точки на его краю</b> — так рисуется поток. Между пулами получится поток сообщений, к данным и аннотациям — ассоциация. Вид
        события, тип шлюза и цвет стрелки меняются справа в свойствах.
      </>
    );
  }
  return (
    <>
      <b>Наведите на элемент и потяните от точки на его краю</b> — так рисуется {notation === 'dfd' ? 'поток данных' : 'связь'}. Выделенную стрелку можно двигать за отрезок;
      бросьте конец на другую стрелку — получится слияние.
    </>
  );
}

export function Hint({ notation, root, empty }: { notation: Notation; root: boolean; empty: boolean }) {
  return (
    <div className="hint no-canvas">
      <div className="hint-dots">
        <i style={{ background: 'var(--icom-i)' }} />
        <i style={{ background: 'var(--icom-c)' }} />
        <i style={{ background: 'var(--icom-o)' }} />
        <i style={{ background: 'var(--icom-m)' }} />
      </div>
      <div>{hintText(notation, root, empty)}</div>
    </div>
  );
}
