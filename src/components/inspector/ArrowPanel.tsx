import type { Arrow, Card, Diagram, Endpoint, LinkKind, Model, Notation, Side } from '../../model/types';
import { arrowRole, boxNumber, contextArrowRoles, labelInherited, labelOf, labelOwner, ROLE_NAME } from '../../model/query';
import { uid } from '../../model/ops';
import { computeGeometry, type ArrowGeom } from '../../model/geometry';
import { projectOnPath } from '../../model/path';
import { KINDS, NOTATIONS, type Choice } from '../../model/notation';
import { canBranch, CARDS, LINKS } from '../../model/links';
import { commit, select, toast } from '../../store';
import { deleteSelection } from '../../actions';
import { Icon } from '../icons';
import { Check, ColorPicker, editArrow, Field, Segmented } from './controls';

type EditArrow = (change: (arrow: Arrow) => void, key?: string) => void;

const LABEL_PLACEHOLDER: Partial<Record<Notation, string>> = {
  bpmn: 'Обычно не нужно; у ветвей шлюза — «Да» / «Нет»',
  epc: 'Обычно не нужно',
  usecase: 'Обычно не нужно',
  class: 'Например, «содержит»',
  sequence: 'Например, «оформитьЗаказ()»',
  activity: 'Условие, например «[да]»',
  deployment: 'Например, «HTTPS»',
  erd: 'Например, «оформляет»',
};

const ICOM_SIDE: Record<Side, string> = { left: 'вход', top: 'управление', right: 'выход', bottom: 'механизм' };
const PLAIN_SIDE: Record<Side, string> = { left: 'слева', top: 'сверху', right: 'справа', bottom: 'снизу' };
const BORDER_SIDE: Record<Side, string> = { left: 'левая граница', top: 'верхняя граница', right: 'правая граница', bottom: 'нижняя граница' };
const MULTIPLICITIES = ['1', '0..1', '*', '0..*', '1..*'];
const LABEL_AWAY = 48;

function describeEnd(model: Model, diagramId: string, end: Endpoint) {
  const diagram = model.diagrams[diagramId];
  switch (end.t) {
    case 'box': {
      const box = diagram.boxes.find((b) => b.id === end.box);
      const number = boxNumber(model, diagramId, end.box);
      const side = diagram.notation === 'idef0' ? ICOM_SIDE[end.side] : PLAIN_SIDE[end.side];
      return `${number ? number + ' ' : ''}«${box?.name || KINDS[box?.kind ?? 'activity'].title}», ${side}`;
    }
    case 'border':
      return BORDER_SIDE[end.side] + ' листа';
    case 'tap': {
      const arrow = diagram.arrows.find((a) => a.id === end.arrow);
      return `стрелка «${arrow ? labelOf(model, arrow) || 'без названия' : '?'}»`;
    }
    default:
      return 'не подключена';
  }
}

function moveLabelAwayFromLine(arrow: Arrow, g: ArrowGeom) {
  const box = g.labelBox;
  const center = { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
  const nearest = projectOnPath(g.points, center).point;
  const distance = Math.hypot(center.x - nearest.x, center.y - nearest.y);
  const [ux, uy] = distance < 1 ? [0, -1] : [(center.x - nearest.x) / distance, (center.y - nearest.y) / distance];
  const shift = LABEL_AWAY - distance;
  arrow.labelDx = Math.round((arrow.labelDx ?? 0) + ux * shift);
  arrow.labelDy = Math.round((arrow.labelDy ?? 0) + uy * shift);
}

function addBranch(model: Model, diagramId: string, arrow: Arrow) {
  const g = computeGeometry(model, model.diagrams[diagramId]).find((x) => x.id === arrow.id);
  if (!g) return;
  const i = Math.max(1, Math.floor(g.points.length / 2));
  const at = { x: Math.round((g.points[i - 1].x + g.points[i].x) / 2), y: Math.round((g.points[i - 1].y + g.points[i].y) / 2) };
  const id = uid('a');
  commit((draft) => {
    draft.diagrams[diagramId].arrows.push({
      id,
      label: '',
      note: '',
      from: { t: 'tap', arrow: arrow.id, x: at.x, y: at.y },
      to: { t: 'free', x: at.x + 70, y: at.y + 70 },
      link: arrow.link,
    });
  });
  select({ arrows: [id] });
  toast('Ветвь создана — перетащите её красный конец к нужной работе.');
}

function labelHint(inherited: boolean, fromParentArrow: boolean, parentLabel: string) {
  if (inherited) return 'Граничная стрелка: название общее с родительской диаграммой.';
  if (fromParentArrow) return `Пока совпадает с основной стрелкой «${parentLabel}». Можно задать своё.`;
  return 'Shift+Enter — перенос строки';
}

function linkColumns(options: Choice<LinkKind>[]) {
  const short = options.length === 2 && options.every((o) => o.label.length <= 12);
  return options.length > 3 || short ? 2 : 1;
}

function LinkKindField({ arrow, notation, edit }: { arrow: Arrow; notation: Notation; edit: EditArrow }) {
  const options = LINKS[notation];
  if (!options || options.length <= 1) return null;
  return (
    <Field label="Вид связи">
      <Segmented<LinkKind> value={arrow.link ?? options[0].value} options={options} onChange={(v) => edit((a) => (a.link = v))} cols={linkColumns(options)} />
    </Field>
  );
}

function MultiplicityFields({ arrow, edit }: { arrow: Arrow; edit: EditArrow }) {
  const change = (field: 'mult0' | 'mult1', value: string) =>
    edit((a) => {
      if (value) a[field] = value;
      else delete a[field];
    }, field);

  return (
    <div className="two-cols tight">
      <Field label="Кратность у начала">
        <input list="mults" value={arrow.mult0 ?? ''} placeholder="1" onChange={(e) => change('mult0', e.target.value)} />
      </Field>
      <Field label="Кратность у конца">
        <input list="mults" value={arrow.mult1 ?? ''} placeholder="0..*" onChange={(e) => change('mult1', e.target.value)} />
      </Field>
      <datalist id="mults">
        {MULTIPLICITIES.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </div>
  );
}

function CardinalitySelect({ value, onChange }: { value: Card; onChange: (card: Card) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Card)}>
      {CARDS.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

function CardinalityFields({ arrow, edit }: { arrow: Arrow; edit: EditArrow }) {
  return (
    <div className="two-cols tight">
      <Field label="У начала">
        <CardinalitySelect value={arrow.card0 ?? '1'} onChange={(card) => edit((a) => (a.card0 = card))} />
      </Field>
      <Field label="У конца">
        <CardinalitySelect value={arrow.card1 ?? '0n'} onChange={(card) => edit((a) => (a.card1 = card))} />
      </Field>
    </div>
  );
}

function tunnelInfo(diagram: Diagram, arrow: Arrow) {
  const hasChild = (end: Endpoint) => end.t === 'box' && !!diagram.boxes.find((b) => b.id === end.box)?.child;
  const towardChild = hasChild(arrow.from) || hasChild(arrow.to);
  const boundary = !!diagram.parent && !arrow.parent && (arrow.from.t === 'border' || arrow.to.t === 'border');
  return { available: diagram.notation === 'idef0' && (towardChild || boundary), towardChild };
}

function routeHint(arrow: Arrow, branching: boolean) {
  if (arrow.seqY !== undefined) return 'Тяните сообщение вверх или вниз, чтобы изменить порядок. Конец можно перетащить на другую линию жизни.';
  if (branching) {
    return 'Тяните за отрезок стрелки, чтобы сдвинуть его. Ветвь: инструмент «Стрелка» (A) или Alt + перетаскивание от стрелки. Слияние: бросьте конец одной стрелки на другую.';
  }
  return 'Тяните за отрезок связи, чтобы сдвинуть его; за круглую точку на конце — чтобы переподключить.';
}

function ArrowActions({ model, diagramId, arrow, branching, edit }: { model: Model; diagramId: string; arrow: Arrow; branching: boolean; edit: EditArrow }) {
  const hasRoute = (arrow.route?.length ?? 0) > 0;
  const pinnedBorder = (arrow.from.t === 'border' && arrow.from.fixed) || (arrow.to.t === 'border' && arrow.to.fixed);
  const labelMoved = !!(arrow.labelDx || arrow.labelDy);

  const straightenArrow = () =>
    edit((a) => {
      delete a.route;
      if (a.from.t === 'border') delete a.from.fixed;
      if (a.to.t === 'border') delete a.to.fixed;
    });
  const resetLabel = () =>
    edit((a) => {
      delete a.labelDx;
      delete a.labelDy;
    });

  return (
    <div className="insp-actions">
      {branching && (
        <button className="btn" onClick={() => addBranch(model, diagramId, arrow)}>
          <Icon.branch />
          Добавить ветвь
        </button>
      )}
      {hasRoute && (
        <button className="btn" onClick={() => edit((a) => delete a.route)}>
          Проложить маршрут автоматически
        </button>
      )}
      {pinnedBorder && (
        <button className="btn" onClick={straightenArrow}>
          Выпрямить стрелку
        </button>
      )}
      {labelMoved && (
        <button className="btn" onClick={resetLabel}>
          Вернуть подпись на место
        </button>
      )}
      {(arrow.labelWidth !== undefined || arrow.labelHeight !== undefined) && (
        <button className="btn" onClick={() => edit((a) => {
          delete a.labelWidth;
          delete a.labelHeight;
        })}>
          Подобрать размер подписи по тексту
        </button>
      )}
      {!arrow.parent && (
        <button className="btn danger" onClick={deleteSelection}>
          <Icon.trash />
          Удалить
        </button>
      )}
      {arrow.parent && model.diagrams[diagramId].notation === 'idef0' && (
        <button className="btn" onClick={deleteSelection} title="Стрелка исчезнет с этой диаграммы, а на родительской у блока появятся скобки. Клавиша Delete делает то же самое.">
          Убрать в туннель
        </button>
      )}
    </div>
  );
}

export function ArrowPanel({ model, diagramId, arrow }: { model: Model; diagramId: string; arrow: Arrow }) {
  const diagram = model.diagrams[diagramId];
  const { notation } = diagram;
  const owner = labelOwner(model, arrow);
  const inherited = owner.id !== arrow.id;
  const fromParentArrow = labelInherited(model, arrow);
  const branching = canBranch(notation);
  const g = computeGeometry(model, diagram).find((x) => x.id === arrow.id);
  const tunnel = tunnelInfo(diagram, arrow);
  const title = notation === 'idef3' || notation === 'bpmn' ? 'Связь' : NOTATIONS[notation].linkWord;
  const role = arrowRole(arrow, contextArrowRoles(diagram).get(arrow.id));

  const edit: EditArrow = (change, key) => editArrow(diagramId, arrow.id, change, key && `${key}-${arrow.id}`);
  const editOwner = (field: 'label' | 'note', value: string) =>
    commit((draft) => {
      const target = draft.diagrams[diagramId].arrows.find((a) => a.id === arrow.id);
      if (target) labelOwner(draft, target)[field] = value;
    }, `arrow-${field}-${owner.id}`);

  const toggleSquiggle = (on: boolean) =>
    edit((a) => {
      a.squiggle = on;
      if (on && g && !g.labelFar) moveLabelAwayFromLine(a, g);
    });

  return (
    <>
      <div className="insp-head">
        <span className="insp-kind">{title}</span>
        {notation === 'idef0' && <span className={'role-chip r-' + role}>{ROLE_NAME[role]}</span>}
      </div>

      <Field label="Название" hint={labelHint(inherited, fromParentArrow, labelOf(model, arrow))}>
        <textarea
          rows={2}
          value={owner.label}
          onChange={(e) => editOwner('label', e.target.value)}
          placeholder={fromParentArrow ? labelOf(model, arrow) : (LABEL_PLACEHOLDER[notation] ?? 'Например, «Заказ клиента»')}
        />
      </Field>
      <Field label="Определение">
        <textarea
          rows={3}
          value={owner.note}
          onChange={(e) => editOwner('note', e.target.value)}
          placeholder={notation === 'idef0' || notation === 'dfd' ? 'Что передаётся по стрелке' : 'Описание связи'}
        />
      </Field>

      <LinkKindField arrow={arrow} notation={notation} edit={edit} />
      {notation === 'class' && arrow.link !== 'anchor' && <MultiplicityFields arrow={arrow} edit={edit} />}
      {notation === 'erd' && <CardinalityFields arrow={arrow} edit={edit} />}
      <ColorPicker diagramId={diagramId} arrowIds={[arrow.id]} value={arrow.color} />

      <Field label="Размер шрифта подписи">
        <input
          type="number"
          min={8}
          max={72}
          value={arrow.fontSize ?? 11.5}
          onChange={(e) => edit((a) => (a.fontSize = Number(e.target.value) || undefined))}
        />
      </Field>

      {g?.showLabel && (
        <Check checked={arrow.squiggle ?? g.labelFar} onChange={toggleSquiggle} title="Зигзаг от подписи к стрелке. Сам появляется, если отвести подпись от стрелки.">
          Молния от подписи к стрелке
        </Check>
      )}
      {notation === 'dfd' && (
        <Check checked={!!arrow.bidir} onChange={(on) => edit((a) => (a.bidir = on || undefined))}>
          Двунаправленный поток
        </Check>
      )}
      {tunnel.available && (
        <Check checked={!!arrow.tunnel} onChange={(on) => edit((a) => (a.tunnel = on || undefined))} title="Туннель: стрелка не переносится на соседний уровень декомпозиции">
          {tunnel.towardChild ? 'В туннель: не показывать на дочерней диаграмме' : 'В туннель: не показывать на родительской диаграмме'}
        </Check>
      )}

      <dl className="route-info">
        <dt>Откуда</dt>
        <dd className={arrow.from.t === 'free' ? 'warn' : ''}>{describeEnd(model, diagramId, arrow.from)}</dd>
        <dt>Куда</dt>
        <dd className={arrow.to.t === 'free' ? 'warn' : ''}>{describeEnd(model, diagramId, arrow.to)}</dd>
      </dl>

      <ArrowActions model={model} diagramId={diagramId} arrow={arrow} branching={branching} edit={edit} />
      <p className="field-hint">{routeHint(arrow, branching)}</p>
    </>
  );
}
