import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
	ChevronDown,
	ChevronRight,
	Link2,
	ListTree,
	Plus,
	Trash2,
	Unlink,
	X,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { useI18n } from "../../i18n/useI18n";
import {
	createTask,
	deleteTask,
	fetchTaskById,
	updateTask,
} from "../../services/api";
import type { Column, Task } from "../../types/task";
import { SortableSubtaskItem } from "./SortableSubtaskItem";

interface TaskHierarchySectionProps {
	task: Task;
	columns: Column[];
	currentColumnId: string;
	currentParentId: string | undefined;
	parentTask: Task | null;
	subtasks: Task[];
	subtaskActionTarget: Task | null;
	onSetSubtaskActionTarget: (target: Task | null) => void;
	isUnlinkParentModalOpen: boolean;
	onSetIsUnlinkParentModalOpen: (open: boolean) => void;
	onParentChange: (
		newParentId: string,
		newParentTask: Task | null,
		newColumnId?: string,
	) => void;
	onSubtasksChange: React.Dispatch<React.SetStateAction<Task[]>>;
	onReloadHierarchy: (overrideParentId?: string) => Promise<void>;
	onSaveSubtasks: (
		taskId: string,
		subtasks: { id: string; completed: boolean }[],
	) => Promise<void>;
	onRefreshBoard: () => Promise<void>;
	onOpenTask?: (task: Task) => void;
}

export const TaskHierarchySection: React.FC<TaskHierarchySectionProps> = ({
	task,
	columns,
	currentColumnId,
	currentParentId,
	parentTask,
	subtasks,
	subtaskActionTarget,
	onSetSubtaskActionTarget,
	isUnlinkParentModalOpen,
	onSetIsUnlinkParentModalOpen,
	onParentChange,
	onSubtasksChange,
	onReloadHierarchy,
	onSaveSubtasks,
	onRefreshBoard,
	onOpenTask,
}) => {
	const { t } = useI18n();
	const [isHierarchyOpen, setIsHierarchyOpen] = useState(() =>
		Boolean(task.parent_id || (task.subtasks && task.subtasks.length > 0)),
	);
	const [newSubtaskInput, setNewSubtaskInput] = useState("");
	const [inputParentId, setInputParentId] = useState("");
	const [inputSubtaskId, setInputSubtaskId] = useState("");
	const [isCreatingSubtask, setIsCreatingSubtask] = useState(false);
	const [isSettingParentOpen, setIsSettingParentOpen] = useState(false);
	const [isAddingNewSubtask, setIsAddingNewSubtask] = useState(false);
	const [isLinkingExistingOpen, setIsLinkingExistingOpen] = useState(false);
	const [isChangingParentOpen, setIsChangingParentOpen] = useState(false);
	const [unlinkSubtaskColumnId, setUnlinkSubtaskColumnId] = useState("");
	const [unlinkParentColumnId, setUnlinkParentColumnId] = useState("");

	const hasValidColumn = (colId?: string) =>
		Boolean(colId && columns.some((c) => c.id === colId));

	const getDefaultUnlinkColumnId = (preferredColumnId?: string) => {
		if (preferredColumnId && columns.some((c) => c.id === preferredColumnId)) {
			return preferredColumnId;
		}
		return columns[0]?.id || "";
	};

	const needsColumnForSubtaskUnlink = Boolean(
		subtaskActionTarget && !hasValidColumn(subtaskActionTarget.column_id),
	);
	const selectedSubtaskUnlinkColumnId = hasValidColumn(unlinkSubtaskColumnId)
		? unlinkSubtaskColumnId
		: getDefaultUnlinkColumnId(task.column_id);

	const needsColumnForParentUnlink = !hasValidColumn(currentColumnId);
	const selectedParentUnlinkColumnId = hasValidColumn(unlinkParentColumnId)
		? unlinkParentColumnId
		: getDefaultUnlinkColumnId(parentTask?.column_id);

	// Auto-expand when hierarchy data arrives for the current task
	const hasHierarchy = Boolean(currentParentId || subtasks.length > 0);
	const [prevHasHierarchy, setPrevHasHierarchy] = useState(hasHierarchy);
	if (hasHierarchy !== prevHasHierarchy) {
		setPrevHasHierarchy(hasHierarchy);
		if (hasHierarchy) {
			setIsHierarchyOpen(true);
		}
	}

	const subtaskSensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleAddSubtask = async () => {
		if (!newSubtaskInput.trim() || isCreatingSubtask) return;

		const titleToAdd = newSubtaskInput.trim();
		setIsCreatingSubtask(true);
		try {
			await createTask({
				parent_id: task.id,
				title: titleToAdd,
				column_id: "",
			});
			setNewSubtaskInput("");
			await onReloadHierarchy();
			await onRefreshBoard();
		} catch (err) {
			console.error("Failed to create subtask:", err);
		} finally {
			setIsCreatingSubtask(false);
		}
	};

	const handleToggleSubtask = async (sub: Task) => {
		const newCompleted = !sub.completed;
		const currentSubtaskRefs = subtasks.map((s) => ({
			id: s.id,
			completed: s.id === sub.id ? newCompleted : Boolean(s.completed),
		}));
		onSubtasksChange((prev) =>
			prev.map((s) =>
				s.id === sub.id ? { ...s, completed: newCompleted } : s,
			),
		);
		try {
			await onSaveSubtasks(task.id, currentSubtaskRefs);
		} catch (err) {
			console.error("Failed to toggle subtask:", err);
			await onReloadHierarchy();
		}
	};

	const handleUnlinkSubtask = async (sub: Task, columnIdToSet?: string) => {
		const remainingSubtasks = subtasks.filter((s) => s.id !== sub.id);
		onSubtasksChange(remainingSubtasks);
		onSetSubtaskActionTarget(null);
		setUnlinkSubtaskColumnId("");
		try {
			const payload: { parent_id: string; column_id?: string } = {
				parent_id: "",
			};
			if (columnIdToSet) {
				payload.column_id = columnIdToSet;
			}
			await updateTask(sub.id, payload);
			await onReloadHierarchy();
			await onRefreshBoard();
		} catch (err) {
			console.error("Failed to unlink subtask:", err);
			await onReloadHierarchy();
		}
	};

	const handleConfirmDeleteSubtask = async (sub: Task) => {
		const remainingSubtasks = subtasks.filter((s) => s.id !== sub.id);
		onSubtasksChange(remainingSubtasks);
		onSetSubtaskActionTarget(null);
		try {
			await deleteTask(sub.id);
			await onReloadHierarchy();
			await onRefreshBoard();
		} catch (err) {
			console.error("Failed to delete subtask:", err);
			await onReloadHierarchy();
		}
	};

	const handleSubtaskDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const oldIndex = subtasks.findIndex((s) => s.id === active.id);
		const newIndex = subtasks.findIndex((s) => s.id === over.id);
		if (oldIndex === -1 || newIndex === -1) return;

		const reordered = arrayMove(subtasks, oldIndex, newIndex);
		onSubtasksChange(reordered);

		const newSubtaskRefs = reordered.map((s) => ({
			id: s.id,
			completed: Boolean(s.completed),
		}));

		try {
			await onSaveSubtasks(task.id, newSubtaskRefs);
		} catch (err) {
			console.error("Failed to reorder subtask:", err);
			await onReloadHierarchy();
		}
	};

	const handleSetParent = async (newParentId: string) => {
		const pId = newParentId.trim();
		if (!pId) return;
		if (pId === task.id) {
			alert(
				t("taskModal.cannotSelfParent") ||
					"自分自身を親タスクに設定することはできません",
			);
			return;
		}
		try {
			const p = await fetchTaskById(pId);
			if (!p?.id) {
				alert(
					t("taskModal.taskNotFound") || "指定されたIDのカードが見つかりません",
				);
				return;
			}
			await updateTask(task.id, { parent_id: p.id });
			onParentChange(p.id, p);
			setInputParentId("");
			setIsSettingParentOpen(false);
			setIsChangingParentOpen(false);
			await onReloadHierarchy(p.id);
			await onRefreshBoard();
		} catch (err) {
			console.error("Failed to set parent:", err);
			const msg =
				err instanceof Error && err.message
					? err.message
					: t("taskModal.taskNotFound") ||
						"指定されたIDのカードが見つかりません";
			alert(msg);
		}
	};

	const handleUnlinkParent = () => {
		setUnlinkParentColumnId(getDefaultUnlinkColumnId(parentTask?.column_id));
		onSetIsUnlinkParentModalOpen(true);
	};

	const handleConfirmUnlinkParent = async () => {
		const colToSet = needsColumnForParentUnlink
			? selectedParentUnlinkColumnId
			: undefined;
		try {
			const payload: { parent_id: string; column_id?: string } = {
				parent_id: "",
			};
			if (colToSet) {
				payload.column_id = colToSet;
			}
			await updateTask(task.id, payload);
			onParentChange("", null, colToSet);
			setInputParentId("");
			setIsChangingParentOpen(false);
			onSetIsUnlinkParentModalOpen(false);
			setUnlinkParentColumnId("");
			await onReloadHierarchy("");
			await onRefreshBoard();
		} catch (err) {
			console.error("Failed to unlink parent:", err);
		}
	};

	const handleAttachExistingTask = async (targetSubtaskId: string) => {
		const sId = targetSubtaskId.trim();
		if (!sId) return;
		if (sId === task.id) {
			alert(
				t("taskModal.cannotSelfSubtask") ||
					"自分自身をサブタスクに設定することはできません",
			);
			return;
		}
		if (subtasks.some((s) => s.id === sId)) {
			alert(t("taskModal.alreadySubtask") || "既にこのタスクのサブタスクです");
			return;
		}
		try {
			const sub = await fetchTaskById(sId);
			if (!sub?.id) {
				alert(
					t("taskModal.taskNotFound") || "指定されたIDのカードが見つかりません",
				);
				return;
			}
			await updateTask(sub.id, { parent_id: task.id });
			setInputSubtaskId("");
			setIsLinkingExistingOpen(false);
			await onReloadHierarchy();
			await onRefreshBoard();
		} catch (err) {
			console.error("Failed to attach existing card as subtask:", err);
			const msg =
				err instanceof Error && err.message
					? err.message
					: t("taskModal.taskNotFound") ||
						"指定されたIDのカードが見つかりません";
			alert(msg);
		}
	};

	const completedCount = subtasks.filter((s) => Boolean(s.completed)).length;
	const progressPercent = Math.round(
		(completedCount / (subtasks.length || 1)) * 100,
	);

	return (
		<>
			<div className="bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-color)] space-y-3">
				{/* Header with Accordion Toggle */}
				<div
					className="flex items-center justify-between cursor-pointer select-none group/hier"
					onClick={() => setIsHierarchyOpen((prev) => !prev)}
				>
					<div className="flex items-center space-x-2 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider min-w-0">
						<ListTree className="w-4 h-4 text-blue-500 shrink-0" />
						<span className="shrink-0">
							{t("taskModal.hierarchyLabel") || "サブタスク・親タスク"}
						</span>
						{currentParentId && (
							<span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20 font-semibold normal-case truncate max-w-[150px]">
								{t("taskModal.parentTask")}:{" "}
								{parentTask?.title || currentParentId}
							</span>
						)}
						{subtasks.length > 0 && (
							<span className="text-[10px] font-mono text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 font-bold shrink-0">
								{subtasks.length}
							</span>
						)}
						{!currentParentId && subtasks.length === 0 && (
							<span className="text-[10px] text-[var(--text-muted)] font-normal normal-case">
								({t("taskModal.notSet") || "未設定"})
							</span>
						)}
					</div>

					<div className="flex items-center space-x-2 shrink-0">
						{subtasks.length > 0 && (
							<span className="text-xs text-[var(--text-muted)] font-mono font-medium">
								{t("taskModal.subtasksProgress", {
									completed: completedCount,
									total: subtasks.length,
									percent: progressPercent,
								})}
							</span>
						)}
						<button
							type="button"
							className="p-1 rounded text-[var(--text-muted)] group-hover/hier:text-[var(--text-primary)] transition-colors"
						>
							{isHierarchyOpen ? (
								<ChevronDown className="w-4 h-4" />
							) : (
								<ChevronRight className="w-4 h-4" />
							)}
						</button>
					</div>
				</div>

				{/* Expanded Content */}
				{isHierarchyOpen && (
					<div className="space-y-4 pt-2 border-t border-[var(--border-color)]">
						{/* Parent Task Area */}
						<div className="space-y-2">
							<label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1">
								<Link2 className="w-3.5 h-3.5 text-blue-400" />{" "}
								{t("taskModal.parentTask")}
							</label>

							{currentParentId ? (
								<div className="flex flex-col gap-2 p-2.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl">
									<div className="flex items-center justify-between gap-2">
										<button
											type="button"
											onClick={() => {
												if (parentTask && onOpenTask) {
													onOpenTask(parentTask);
												}
											}}
											className="font-medium text-xs text-[var(--text-primary)] hover:text-blue-400 hover:underline transition-colors truncate text-left cursor-pointer flex-1"
										>
											{parentTask?.title || currentParentId}
										</button>
										<div className="flex items-center space-x-1 shrink-0">
											<button
												type="button"
												onClick={() => setIsChangingParentOpen((prev) => !prev)}
												className="px-2 py-1 text-[11px] font-medium bg-[var(--modal-bg)] hover:bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg transition-all cursor-pointer"
											>
												{t("taskModal.changeParent")}
											</button>
											<button
												type="button"
												onClick={handleUnlinkParent}
												className="px-2 py-1 text-[11px] font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 rounded-lg transition-all cursor-pointer flex items-center space-x-1"
												title={t("taskModal.unlinkParent")}
											>
												<Unlink className="w-3 h-3" />
												<span>{t("taskModal.unlinkParent")}</span>
											</button>
										</div>
									</div>

									{isChangingParentOpen && (
										<div className="pt-2 border-t border-[var(--border-color)] flex items-center space-x-2">
											<input
												type="text"
												autoFocus
												value={inputParentId}
												onChange={(e) => setInputParentId(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === "Enter" && !e.nativeEvent.isComposing) {
														e.preventDefault();
														handleSetParent(inputParentId);
													}
												}}
												placeholder={t("taskModal.parentIdPlaceholder")}
												className="flex-1 text-xs py-1.5 px-2.5 bg-[var(--modal-bg)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 font-mono"
											/>
											<button
												type="button"
												onClick={() => handleSetParent(inputParentId)}
												disabled={!inputParentId.trim()}
												className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-all cursor-pointer shrink-0"
											>
												{t("taskModal.changeParent")}
											</button>
											<button
												type="button"
												onClick={() => {
													setIsChangingParentOpen(false);
													setInputParentId("");
												}}
												className="px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
											>
												{t("taskModal.cancel")}
											</button>
										</div>
									)}
								</div>
							) : isSettingParentOpen ? (
								<div className="flex items-center space-x-2 p-2 bg-[var(--bg-input)] border border-blue-500/30 rounded-xl">
									<input
										type="text"
										autoFocus
										value={inputParentId}
										onChange={(e) => setInputParentId(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter" && !e.nativeEvent.isComposing) {
												e.preventDefault();
												handleSetParent(inputParentId);
											}
										}}
										placeholder={t("taskModal.parentIdPlaceholder")}
										className="flex-1 text-xs py-1.5 px-2.5 bg-[var(--modal-bg)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 font-mono"
									/>
									<button
										type="button"
										onClick={() => handleSetParent(inputParentId)}
										disabled={!inputParentId.trim()}
										className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-all cursor-pointer shrink-0"
									>
										{t("taskModal.link")}
									</button>
									<button
										type="button"
										onClick={() => {
											setIsSettingParentOpen(false);
											setInputParentId("");
										}}
										className="px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
									>
										{t("taskModal.cancel")}
									</button>
								</div>
							) : (
								<div>
									<button
										type="button"
										onClick={() => setIsSettingParentOpen(true)}
										className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--bg-input)] hover:bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl transition-all cursor-pointer"
									>
										<Plus className="w-3.5 h-3.5" />
										<span>{t("taskModal.setParent") || "親タスクを設定"}</span>
									</button>
								</div>
							)}
						</div>

						{/* Subtasks Area (shown for root tasks) */}
						{!currentParentId && (
							<div className="space-y-2 pt-2 border-t border-[var(--border-color)]">
								<div className="flex items-center justify-between">
									<label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1">
										<ListTree className="w-3.5 h-3.5 text-blue-500" />{" "}
										{t("taskModal.subtasksLabel")}
									</label>
								</div>

								{/* Progress Bar */}
								{subtasks.length > 0 && (
									<div className="w-full bg-[var(--bg-input)] rounded-full h-1.5 overflow-hidden">
										<div
											className={`h-full transition-all duration-300 ${
												completedCount === subtasks.length
													? "bg-emerald-500"
													: "bg-blue-500"
											}`}
											style={{ width: `${progressPercent}%` }}
										/>
									</div>
								)}

								{/* Subtasks List */}
								{subtasks.length > 0 && (
									<DndContext
										sensors={subtaskSensors}
										collisionDetection={closestCenter}
										onDragEnd={handleSubtaskDragEnd}
									>
										<SortableContext
											items={subtasks.map((s) => s.id)}
											strategy={verticalListSortingStrategy}
										>
											<div className="space-y-1.5 pt-1">
												{subtasks.map((sub) => (
													<SortableSubtaskItem
														key={sub.id}
														sub={sub}
														columns={columns}
														onToggle={handleToggleSubtask}
														onOpen={(s) => onOpenTask?.(s)}
														onDelete={(s) => onSetSubtaskActionTarget(s)}
													/>
												))}
											</div>
										</SortableContext>
									</DndContext>
								)}

								{/* Subtasks Actions & Forms */}
								<div className="pt-1">
									{isAddingNewSubtask ? (
										<div className="flex items-center space-x-2 p-2 bg-[var(--bg-input)] border border-blue-500/30 rounded-xl">
											<input
												type="text"
												autoFocus
												value={newSubtaskInput}
												onChange={(e) => setNewSubtaskInput(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === "Enter" && !e.nativeEvent.isComposing) {
														e.preventDefault();
														handleAddSubtask();
													}
												}}
												placeholder={t("taskModal.subtaskPlaceholder")}
												className="flex-1 px-3 py-1.5 text-xs bg-[var(--modal-bg)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 font-medium"
											/>
											<button
												type="button"
												onClick={handleAddSubtask}
												disabled={!newSubtaskInput.trim() || isCreatingSubtask}
												className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-all cursor-pointer flex items-center space-x-1 shrink-0"
											>
												<Plus className="w-3.5 h-3.5" />
												<span>{t("configModal.add") || "追加"}</span>
											</button>
											<button
												type="button"
												onClick={() => {
													setIsAddingNewSubtask(false);
													setNewSubtaskInput("");
												}}
												className="px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
											>
												{t("taskModal.cancel")}
											</button>
										</div>
									) : isLinkingExistingOpen ? (
										<div className="flex items-center space-x-2 p-2 bg-[var(--bg-input)] border border-blue-500/30 rounded-xl">
											<input
												type="text"
												autoFocus
												value={inputSubtaskId}
												onChange={(e) => setInputSubtaskId(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === "Enter" && !e.nativeEvent.isComposing) {
														e.preventDefault();
														handleAttachExistingTask(inputSubtaskId);
													}
												}}
												placeholder={t("taskModal.subtaskIdPlaceholder")}
												className="flex-1 text-xs py-1.5 px-2.5 bg-[var(--modal-bg)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 font-mono"
											/>
											<button
												type="button"
												onClick={() => handleAttachExistingTask(inputSubtaskId)}
												disabled={!inputSubtaskId.trim()}
												className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 transition-all cursor-pointer shrink-0"
											>
												{t("taskModal.link") || "紐付け"}
											</button>
											<button
												type="button"
												onClick={() => {
													setIsLinkingExistingOpen(false);
													setInputSubtaskId("");
												}}
												className="px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
											>
												{t("taskModal.cancel")}
											</button>
										</div>
									) : (
										<div className="flex items-center space-x-2">
											<button
												type="button"
												onClick={() => setIsAddingNewSubtask(true)}
												className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--bg-input)] hover:bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl transition-all cursor-pointer"
											>
												<Plus className="w-3.5 h-3.5" />
												<span>
													{t("taskModal.addSubtask") || "サブタスクを追加"}
												</span>
											</button>

											<button
												type="button"
												onClick={() => setIsLinkingExistingOpen(true)}
												className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--bg-input)] hover:bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl transition-all cursor-pointer"
											>
												<Link2 className="w-3.5 h-3.5" />
												<span>
													{t("taskModal.addExistingSubtask") ||
														"既存カードを紐付け"}
												</span>
											</button>
										</div>
									)}
								</div>
							</div>
						)}
					</div>
				)}
			</div>

			{/* Subtask Action / Delete Confirmation Dialog */}
			{subtaskActionTarget && (
				<div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
					<div className="w-full max-w-md bg-[var(--modal-bg)] text-[var(--text-primary)] rounded-2xl border border-[var(--border-color)] shadow-2xl overflow-hidden p-5 space-y-4 animate-in zoom-in-95 duration-150">
						<div className="flex items-center justify-between">
							<div className="flex items-center space-x-2">
								<div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
									<ListTree className="w-5 h-5" />
								</div>
								<h3 className="text-base font-bold text-[var(--text-primary)]">
									{t("taskModal.subtaskActionTitle")}
								</h3>
							</div>
							<button
								type="button"
								onClick={() => {
									onSetSubtaskActionTarget(null);
									setUnlinkSubtaskColumnId("");
								}}
								className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 rounded-lg transition-colors cursor-pointer"
							>
								<X className="w-4 h-4" />
							</button>
						</div>

						<p className="text-xs text-[var(--text-secondary)]">
							{t("taskModal.subtaskActionDesc", {
								title: subtaskActionTarget.title,
							})}
						</p>

						<div className="space-y-2 pt-1">
							{needsColumnForSubtaskUnlink && columns.length > 0 ? (
								<div className="w-full p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] space-y-2.5">
									<div className="flex items-start space-x-3">
										<div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 mt-0.5 shrink-0">
											<Unlink className="w-4 h-4" />
										</div>
										<div className="flex-1 min-w-0">
											<div className="text-xs font-semibold text-[var(--text-primary)]">
												{t("taskModal.unlinkSubtask")}
											</div>
											<div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
												{t("taskModal.unlinkSelectColumnDesc")}
											</div>
										</div>
									</div>
									<div className="flex items-center space-x-2 pl-10">
										<div className="relative flex-1 flex items-center">
											<select
												value={selectedSubtaskUnlinkColumnId}
												onChange={(e) =>
													setUnlinkSubtaskColumnId(e.target.value)
												}
												aria-label={t("taskModal.unlinkColumnLabel")}
												className="w-full py-1.5 pl-2.5 pr-7 text-xs bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-blue-500 appearance-none cursor-pointer font-medium"
											>
												{columns.map((col) => (
													<option
														key={col.id}
														value={col.id}
														className="bg-[var(--modal-bg)] text-[var(--text-primary)]"
													>
														{col.name}
													</option>
												))}
											</select>
											<ChevronDown className="absolute right-2 w-3.5 h-3.5 text-[var(--text-secondary)] pointer-events-none" />
										</div>
										<button
											type="button"
											onClick={() =>
												handleUnlinkSubtask(
													subtaskActionTarget,
													selectedSubtaskUnlinkColumnId,
												)
											}
											className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all cursor-pointer shrink-0"
										>
											{t("taskModal.unlinkConfirmButton")}
										</button>
									</div>
								</div>
							) : (
								<button
									type="button"
									onClick={() => handleUnlinkSubtask(subtaskActionTarget)}
									className="w-full flex items-start space-x-3 p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] hover:bg-[var(--bg-card)] hover:border-blue-500/50 transition-all text-left group/action cursor-pointer"
								>
									<div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 group-hover/action:scale-105 transition-transform mt-0.5 shrink-0">
										<Unlink className="w-4 h-4" />
									</div>
									<div className="flex-1 min-w-0">
										<div className="text-xs font-semibold text-[var(--text-primary)]">
											{t("taskModal.unlinkSubtask")}
										</div>
										<div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
											{t("taskModal.unlinkSubtaskDesc")}
										</div>
									</div>
								</button>
							)}

							<button
								type="button"
								onClick={() => handleConfirmDeleteSubtask(subtaskActionTarget)}
								className="w-full flex items-start space-x-3 p-3 rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 hover:border-rose-500/40 transition-all text-left group/action cursor-pointer"
							>
								<div className="p-2 rounded-lg bg-rose-500/10 text-rose-500 group-hover/action:scale-105 transition-transform mt-0.5 shrink-0">
									<Trash2 className="w-4 h-4" />
								</div>
								<div className="flex-1 min-w-0">
									<div className="text-xs font-semibold text-rose-500">
										{t("taskModal.deleteSubtaskCompletely")}
									</div>
									<div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
										{t("taskModal.deleteSubtaskCompletelyDesc")}
									</div>
								</div>
							</button>
						</div>

						<div className="pt-2 flex justify-end">
							<button
								type="button"
								onClick={() => {
									onSetSubtaskActionTarget(null);
									setUnlinkSubtaskColumnId("");
								}}
								className="px-4 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-input)] hover:bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl transition-all cursor-pointer"
							>
								{t("taskModal.cancel")}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Unlink Parent Confirmation Dialog */}
			{isUnlinkParentModalOpen && (
				<div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
					<div className="w-full max-w-md bg-[var(--modal-bg)] text-[var(--text-primary)] rounded-2xl border border-[var(--border-color)] shadow-2xl overflow-hidden p-5 space-y-4 animate-in zoom-in-95 duration-150">
						<div className="flex items-center justify-between">
							<div className="flex items-center space-x-2">
								<div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
									<Unlink className="w-5 h-5" />
								</div>
								<h3 className="text-base font-bold text-[var(--text-primary)]">
									{t("taskModal.unlinkParent")}
								</h3>
							</div>
							<button
								type="button"
								onClick={() => {
									onSetIsUnlinkParentModalOpen(false);
									setUnlinkParentColumnId("");
								}}
								className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 rounded-lg transition-colors cursor-pointer"
							>
								<X className="w-4 h-4" />
							</button>
						</div>

						<p className="text-xs text-[var(--text-secondary)]">
							{needsColumnForParentUnlink
								? t("taskModal.unlinkSelectColumnDesc")
								: t("taskModal.unlinkParentConfirm")}
						</p>

						{needsColumnForParentUnlink && columns.length > 0 && (
							<div className="space-y-1.5">
								<label className="block text-[11px] font-semibold text-[var(--text-secondary)]">
									{t("taskModal.unlinkColumnLabel")}
								</label>
								<div className="relative flex items-center">
									<select
										value={selectedParentUnlinkColumnId}
										onChange={(e) => setUnlinkParentColumnId(e.target.value)}
										className="w-full py-2 px-3 pr-8 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500 appearance-none cursor-pointer font-medium"
									>
										{columns.map((col) => (
											<option
												key={col.id}
												value={col.id}
												className="bg-[var(--modal-bg)] text-[var(--text-primary)]"
											>
												{col.name}
											</option>
										))}
									</select>
									<ChevronDown className="absolute right-2.5 w-4 h-4 text-[var(--text-secondary)] pointer-events-none" />
								</div>
							</div>
						)}

						<div className="pt-2 flex justify-end space-x-2">
							<button
								type="button"
								onClick={() => {
									onSetIsUnlinkParentModalOpen(false);
									setUnlinkParentColumnId("");
								}}
								className="px-4 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-input)] hover:bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl transition-all cursor-pointer"
							>
								{t("taskModal.cancel")}
							</button>
							<button
								type="button"
								onClick={handleConfirmUnlinkParent}
								className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all cursor-pointer"
							>
								{needsColumnForParentUnlink
									? t("taskModal.unlinkConfirmButton")
									: t("taskModal.unlinkParent")}
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
};
