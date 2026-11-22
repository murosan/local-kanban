import {
	AlertCircle,
	AlignLeft,
	Check,
	ChevronDown,
	Clock,
	Columns,
	Copy,
	CopyPlus,
	FileText,
	Loader2,
	Maximize2,
	Minimize2,
	MoreVertical,
	Save,
	Tag,
	Trash2,
	X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { fetchTaskById } from "../services/api";
import type {
	Column,
	CustomFieldDef,
	CustomFieldValue,
	Task,
} from "../types/task";
import { copyTextToClipboard } from "../utils/copyCommand";
import { ActionMenu, type ActionMenuGroup } from "./ActionMenu";
import { type ChangeOptions, MarkdownEditor } from "./MarkdownEditor";
import { TagInput } from "./TagInput";
import { CustomFieldsSection } from "./taskModal/CustomFieldsSection";
import { TaskHierarchySection } from "./taskModal/TaskHierarchySection";
import { parseInitialCustomFields } from "./taskModal/utils";

interface TaskModalProps {
	isOpen: boolean;
	task: Task | null; // Null means create mode
	columns?: Column[];
	initialColumnId?: string;
	customFields?: CustomFieldDef[];
	availableTags?: string[];
	allTasks?: Task[];
	onClose: () => void;
	onSave: (
		taskData: Partial<Task>,
		options?: { silent?: boolean },
	) => Promise<void>;
	onRefresh?: () => Promise<void> | void;
	onDuplicate?: (task: Task) => Promise<Task | null>;
	onDelete?: (id: string) => Promise<void>;
	onOpenTask?: (task: Task) => void;
}

interface FormState {
	title: string;
	columnId: string;
	tags: string[];
	content: string;
	customFieldsState: CustomFieldValue[];
	selectionStart?: number;
	selectionEnd?: number;
}

type SaveStatus = "saved" | "saving" | "unsaved" | "error";

export const TaskModal: React.FC<TaskModalProps> = ({
	isOpen,
	task,
	columns = [],
	initialColumnId = "",
	customFields = [],
	availableTags = [],
	onClose,
	onSave,
	onRefresh,
	onDuplicate,
	onDelete,
	onOpenTask,
}) => {
	const { t } = useI18n();
	const modalInstanceId = useId();

	const [title, setTitle] = useState(() => (task ? task.title : ""));
	const [columnId, setColumnId] = useState<string>(() =>
		task ? task.column_id || "" : initialColumnId || columns[0]?.id || "",
	);
	const [tags, setTags] = useState<string[]>(() =>
		task?.tags ? [...task.tags] : [],
	);
	const [content, setContent] = useState(() =>
		task ? task.content || "" : "",
	);
	const [customFieldsState, setCustomFieldsState] = useState<
		CustomFieldValue[]
	>(() => parseInitialCustomFields(task, customFields));

	const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
	const [isSaving, setIsSaving] = useState(false);
	const [isDuplicating, setIsDuplicating] = useState(false);
	const [isLoadingContent, setIsLoadingContent] = useState(false);
	const [isMaximized, setIsMaximized] = useState(false);
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [isAddFieldOpen, setIsAddFieldOpen] = useState(false);
	const [isIdCopied, setIsIdCopied] = useState(false);

	// Subtasks & Parent State
	const [subtasks, setSubtasks] = useState<Task[]>([]);
	const [parentTask, setParentTask] = useState<Task | null>(null);
	const [parentId, setParentId] = useState<string | undefined>(
		() => task?.parent_id,
	);
	const [subtaskActionTarget, setSubtaskActionTarget] = useState<Task | null>(
		null,
	);
	const [isUnlinkParentModalOpen, setIsUnlinkParentModalOpen] = useState(false);
	const currentParentId = parentId !== undefined ? parentId : task?.parent_id;

	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);

	const isDraggingCustomFieldRef = useRef(false);
	const historyRef = useRef<FormState[]>([]);
	const historyIndexRef = useRef<number>(-1);
	const lastPushTimeRef = useRef<number>(0);
	const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const copyIdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const contentDirtyRef = useRef(false);
	const saveStatusRef = useRef<SaveStatus>("saved");
	const loadedKeyRef = useRef<string | null>(null);
	const latestPropsRef = useRef({
		task,
		initialColumnId,
		columns,
		customFields,
	});
	latestPropsRef.current = { task, initialColumnId, columns, customFields };

	const latestStateRef = useRef<FormState>({
		title,
		columnId,
		tags,
		content,
		customFieldsState,
	});

	useEffect(() => {
		latestStateRef.current = {
			title,
			columnId,
			tags,
			content,
			customFieldsState,
		};
	}, [title, columnId, tags, content, customFieldsState]);

	useEffect(() => {
		saveStatusRef.current = saveStatus;
	}, [saveStatus]);

	const reloadHierarchy = useCallback(
		async (overrideParentId?: string) => {
			if (!task) {
				setSubtasks([]);
				setParentTask(null);
				return;
			}

			const effectiveParentId =
				overrideParentId !== undefined
					? overrideParentId
					: (parentId ?? task.parent_id);

			if (effectiveParentId) {
				try {
					const p = await fetchTaskById(effectiveParentId);
					setParentTask(p);
				} catch (e) {
					console.error("Failed to load parent task:", e);
				}
			} else {
				setParentTask(null);
			}

			try {
				const fullTask = await fetchTaskById(task.id);
				setSubtasks(fullTask.subtask_details || []);
			} catch (e) {
				console.error("Failed to load subtasks:", e);
			}
		},
		[task, parentId],
	);

	const executeSave = useCallback(
		async (formStateToSave?: FormState) => {
			if (!task) return;
			const currentState = formStateToSave || latestStateRef.current;
			if (!currentState.title.trim()) return;

			if (autoSaveTimerRef.current) {
				clearTimeout(autoSaveTimerRef.current);
				autoSaveTimerRef.current = null;
			}

			setSaveStatus("saving");
			setIsSaving(true);
			try {
				await onSave(
					{
						id: task.id,
						parent_id: currentParentId,
						title: currentState.title.trim(),
						column_id: currentParentId
							? currentState.columnId
							: currentState.columnId || columns[0]?.id,
						tags: currentState.tags || [],
						custom_fields: currentState.customFieldsState,
						content: currentState.content.trimEnd(),
					},
					{ silent: true },
				);
				setSaveStatus("saved");
			} catch (err) {
				console.error("Auto-save error:", err);
				setSaveStatus("error");
			} finally {
				setIsSaving(false);
			}
		},
		[task, currentParentId, columns, onSave],
	);

	const triggerAutoSave = useCallback(
		(newState: FormState, immediate: boolean = false) => {
			if (!task) return;

			setSaveStatus("unsaved");
			if (autoSaveTimerRef.current) {
				clearTimeout(autoSaveTimerRef.current);
				autoSaveTimerRef.current = null;
			}

			if (immediate) {
				void executeSave(newState);
			} else {
				autoSaveTimerRef.current = setTimeout(() => {
					void executeSave(newState);
				}, 500);
			}
		},
		[task, executeSave],
	);

	const flushPendingSave = useCallback(async () => {
		if (autoSaveTimerRef.current) {
			clearTimeout(autoSaveTimerRef.current);
			autoSaveTimerRef.current = null;
		}
		if (
			task &&
			(saveStatusRef.current === "unsaved" || saveStatusRef.current === "error")
		) {
			await executeSave();
		}
	}, [task, executeSave]);

	const handleCloseWithSave = useCallback(async () => {
		await flushPendingSave();
		onClose();
	}, [flushPendingSave, onClose]);

	const handleNavigateTask = useCallback(
		async (targetTask: Task) => {
			await flushPendingSave();
			onOpenTask?.(targetTask);
		},
		[flushPendingSave, onOpenTask],
	);

	const currentTaskId = task?.id;

	// Reset local form state when modal opens or switches to a different task
	useEffect(() => {
		if (!isOpen) {
			loadedKeyRef.current = null;
			return;
		}

		const nextKey = currentTaskId ?? "__create__";
		if (loadedKeyRef.current === nextKey) {
			return;
		}
		loadedKeyRef.current = nextKey;

		if (autoSaveTimerRef.current) {
			clearTimeout(autoSaveTimerRef.current);
			autoSaveTimerRef.current = null;
		}

		const {
			task: currentTask,
			initialColumnId: initColId,
			columns: currentColumns,
			customFields: currentPresetFields,
		} = latestPropsRef.current;

		setIsMenuOpen(false);
		setIsAddFieldOpen(false);
		setSubtaskActionTarget(null);
		setIsUnlinkParentModalOpen(false);
		contentDirtyRef.current = false;

		const initialTitle = currentTask ? currentTask.title : "";
		const initialCol = currentTask
			? currentTask.column_id || ""
			: initColId || currentColumns[0]?.id || "";
		const initialTags = currentTask?.tags ? [...currentTask.tags] : [];
		const initialContent = currentTask ? currentTask.content || "" : "";
		const initialFields = parseInitialCustomFields(
			currentTask,
			currentPresetFields,
		);

		setTitle(initialTitle);
		setColumnId(initialCol);
		setTags(initialTags);
		setContent(initialContent);
		setCustomFieldsState(initialFields);
		setSaveStatus("saved");
		setParentId(currentTask?.parent_id);
		setSubtasks(currentTask?.subtask_details || []);
		setParentTask(null);

		const initial: FormState = {
			title: initialTitle,
			columnId: initialCol,
			tags: initialTags,
			content: initialContent,
			customFieldsState: initialFields,
		};
		latestStateRef.current = initial;
		historyRef.current = [initial];
		historyIndexRef.current = 0;
		setCanUndo(false);
		setCanRedo(false);
	}, [isOpen, currentTaskId]);

	// Fetch full task content + parent/subtasks (StrictMode-safe with cancellation)
	useEffect(() => {
		if (!isOpen || !currentTaskId) {
			return;
		}

		let cancelled = false;
		const initialParentId = latestPropsRef.current.task?.parent_id;

		(async () => {
			setIsLoadingContent(true);
			try {
				const [fullTask, fetchedParent] = await Promise.all([
					fetchTaskById(currentTaskId),
					initialParentId
						? fetchTaskById(initialParentId).catch(() => null)
						: Promise.resolve(null),
				]);

				if (cancelled) return;

				if (fullTask) {
					setSubtasks(fullTask.subtask_details || []);
					if (fullTask.parent_id && fullTask.parent_id !== initialParentId) {
						setParentId(fullTask.parent_id);
						fetchTaskById(fullTask.parent_id)
							.then((p) => {
								if (!cancelled) setParentTask(p);
							})
							.catch(() => {});
					} else if (fetchedParent) {
						setParentTask(fetchedParent);
					}

					if (fullTask.content !== undefined && !contentDirtyRef.current) {
						const fetchedContent = fullTask.content || "";
						setContent(fetchedContent);
						if (historyRef.current.length > 0) {
							historyRef.current[0].content = fetchedContent;
						}
						latestStateRef.current = {
							...latestStateRef.current,
							content: fetchedContent,
						};
					}
				}
			} catch (err) {
				if (!cancelled) {
					console.error("Error fetching full task detail:", err);
				}
			} finally {
				if (!cancelled) {
					setIsLoadingContent(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [isOpen, currentTaskId]);

	useEffect(() => {
		return () => {
			if (autoSaveTimerRef.current) {
				clearTimeout(autoSaveTimerRef.current);
			}
			if (copyIdTimerRef.current) {
				clearTimeout(copyIdTimerRef.current);
			}
		};
	}, []);

	const recordHistory = useCallback(
		(newState: FormState, options?: ChangeOptions) => {
			const now = Date.now();
			const isImmediate = options?.immediate ?? false;
			const history = historyRef.current;
			const index = historyIndexRef.current;

			const newHistory = index >= 0 ? history.slice(0, index + 1) : [];

			if (
				!isImmediate &&
				newHistory.length > 0 &&
				now - lastPushTimeRef.current < 400
			) {
				newHistory[newHistory.length - 1] = newState;
			} else {
				newHistory.push(newState);
				lastPushTimeRef.current = now;
			}

			historyRef.current = newHistory;
			historyIndexRef.current = newHistory.length - 1;
			setCanUndo(newHistory.length - 1 > 0);
			setCanRedo(false);
		},
		[],
	);

	const applyFormState = useCallback(
		(targetState: FormState) => {
			setTitle(targetState.title);
			setColumnId(targetState.columnId);
			setTags(targetState.tags);
			setContent(targetState.content);
			setCustomFieldsState(targetState.customFieldsState);
			latestStateRef.current = targetState;
			triggerAutoSave(targetState, true);
		},
		[triggerAutoSave],
	);

	const handleUndo = useCallback(() => {
		const history = historyRef.current;
		const index = historyIndexRef.current;
		if (index > 0) {
			const prevIndex = index - 1;
			historyIndexRef.current = prevIndex;
			setCanUndo(prevIndex > 0);
			setCanRedo(prevIndex < history.length - 1);
			applyFormState(history[prevIndex]);
		}
	}, [applyFormState]);

	const handleRedo = useCallback(() => {
		const history = historyRef.current;
		const index = historyIndexRef.current;
		if (index < history.length - 1) {
			const nextIndex = index + 1;
			historyIndexRef.current = nextIndex;
			setCanUndo(nextIndex > 0);
			setCanRedo(nextIndex < history.length - 1);
			applyFormState(history[nextIndex]);
		}
	}, [applyFormState]);

	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (isDraggingCustomFieldRef.current) return;
				e.preventDefault();
				if (isUnlinkParentModalOpen) {
					setIsUnlinkParentModalOpen(false);
					return;
				}
				if (subtaskActionTarget) {
					setSubtaskActionTarget(null);
					return;
				}
				if (isAddFieldOpen) {
					setIsAddFieldOpen(false);
					return;
				}
				if (isMenuOpen) {
					setIsMenuOpen(false);
					return;
				}
				void handleCloseWithSave();
				return;
			}

			const isMod = e.metaKey || e.ctrlKey;
			if (isMod && !e.isComposing) {
				if (e.key === "z" || e.key === "Z") {
					e.preventDefault();
					e.stopPropagation();
					if (e.shiftKey) {
						handleRedo();
					} else {
						handleUndo();
					}
				} else if (e.key === "y" || e.key === "Y") {
					e.preventDefault();
					e.stopPropagation();
					handleRedo();
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [
		isOpen,
		isUnlinkParentModalOpen,
		subtaskActionTarget,
		isAddFieldOpen,
		isMenuOpen,
		handleCloseWithSave,
		handleUndo,
		handleRedo,
	]);

	if (!isOpen) return null;

	const commitChange = (patch: Partial<FormState>, options?: ChangeOptions) => {
		const newState: FormState = {
			...latestStateRef.current,
			...patch,
		};
		latestStateRef.current = newState;
		recordHistory(newState, options);
		triggerAutoSave(newState, options?.immediate ?? false);
	};

	const handleTitleChange = (newTitle: string) => {
		setTitle(newTitle);
		commitChange({ title: newTitle }, { immediate: false });
	};

	const handleColumnIdChange = (newColumnId: string) => {
		setColumnId(newColumnId);
		commitChange({ columnId: newColumnId }, { immediate: true });
	};

	const handleTagsChange = (newTags: string[]) => {
		setTags(newTags);
		commitChange({ tags: newTags }, { immediate: true });
	};

	const handleCustomFieldsChange = (
		nextFields: CustomFieldValue[],
		immediate: boolean,
	) => {
		setCustomFieldsState(nextFields);
		commitChange({ customFieldsState: nextFields }, { immediate });
	};

	const handleContentChange = (newContent: string, options?: ChangeOptions) => {
		contentDirtyRef.current = true;
		setContent(newContent);
		commitChange(
			{
				content: newContent,
				selectionStart: options?.selectionStart,
				selectionEnd: options?.selectionEnd,
			},
			options,
		);
	};

	const handleCopyTaskId = async () => {
		if (!task) return;
		const ok = await copyTextToClipboard(task.id);
		if (!ok) return;
		setIsIdCopied(true);
		if (copyIdTimerRef.current) {
			clearTimeout(copyIdTimerRef.current);
		}
		copyIdTimerRef.current = setTimeout(() => setIsIdCopied(false), 1500);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!title.trim()) return;

		if (task) {
			await executeSave();
		} else {
			setIsSaving(true);
			try {
				await onSave({
					title: title.trim(),
					column_id: columnId || columns[0]?.id,
					tags: tags || [],
					custom_fields: customFieldsState,
					content: content.trimEnd(),
				});
				onClose();
			} finally {
				setIsSaving(false);
			}
		}
	};

	const handleDuplicate = async () => {
		if (!task || !onDuplicate || isDuplicating) return;
		setIsDuplicating(true);
		try {
			await flushPendingSave();
			const latestTitle = latestStateRef.current.title.trim() || task.title;
			await onDuplicate({ ...task, title: latestTitle });
		} finally {
			setIsDuplicating(false);
		}
	};

	const handleDelete = async () => {
		if (!task || !onDelete) return;
		if (confirm(t("taskModal.deleteConfirm"))) {
			setIsSaving(true);
			try {
				await onDelete(task.id);
				onClose();
			} finally {
				setIsSaving(false);
			}
		}
	};

	const actionMenuGroups: ActionMenuGroup[] = [];
	if (task && onDuplicate) {
		actionMenuGroups.push({
			id: "actions",
			items: [
				{
					id: "duplicate",
					label: isDuplicating
						? t("taskModal.duplicating")
						: t("taskModal.duplicate"),
					icon: <CopyPlus className="w-4 h-4" />,
					disabled: isSaving || isDuplicating,
					onSelect: handleDuplicate,
				},
			],
		});
	}
	if (task && onDelete) {
		actionMenuGroups.push({
			id: "danger",
			items: [
				{
					id: "delete",
					label: t("taskModal.delete"),
					icon: <Trash2 className="w-4 h-4" />,
					disabled: isSaving || isDuplicating,
					variant: "danger",
					onSelect: handleDelete,
				},
			],
		});
	}

	const handleRefreshBoard = async () => {
		await onRefresh?.();
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-2 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
			<div
				className={`w-full bg-[var(--modal-bg)] text-[var(--text-primary)] rounded-2xl border border-[var(--border-color)] shadow-2xl overflow-hidden transition-all duration-300 ${
					isMaximized
						? "w-[99vw] h-[98vh] max-w-none max-h-none"
						: "w-[98vw] max-w-7xl h-[97vh]"
				}`}
			>
				<form
					onSubmit={handleSubmit}
					className="h-full flex flex-col overflow-hidden"
				>
					{/* Header */}
					<div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
						<div className="flex items-center space-x-2.5">
							<FileText className="w-5 h-5 text-blue-500" />
							<h2 className="text-lg font-bold text-[var(--text-primary)]">
								{task ? t("taskModal.editTitle") : t("taskModal.createTitle")}
							</h2>
							{task && (
								<button
									type="button"
									onClick={handleCopyTaskId}
									className="flex items-center space-x-1 text-xs font-mono text-[var(--text-muted)] hover:text-blue-400 bg-[var(--bg-input)] hover:bg-[var(--bg-card)] px-2 py-0.5 rounded-lg border border-[var(--border-color)] transition-all cursor-pointer group/id"
									title={t("taskModal.copyId")}
								>
									{isIdCopied ? (
										<>
											<Check className="w-3 h-3 text-emerald-400" />
											<span className="text-emerald-400 font-sans font-medium text-[11px]">
												{t("taskModal.copied")}
											</span>
										</>
									) : (
										<>
											<Copy className="w-3 h-3 group-hover/id:scale-110 transition-transform" />
											<span className="text-[11px]">{task.id}</span>
										</>
									)}
								</button>
							)}
						</div>
						<div className="flex items-center space-x-2">
							{task ? (
								<button
									type="button"
									onClick={() => executeSave()}
									className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
										saveStatus === "saved"
											? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
											: saveStatus === "saving"
												? "bg-blue-500/10 text-blue-400 border-blue-500/30"
												: saveStatus === "error"
													? "bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20"
													: "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
									}`}
									title="クリックで手動即時保存"
								>
									{saveStatus === "saved" && (
										<>
											<Check className="w-3.5 h-3.5 text-emerald-400" />
											<span>{t("taskModal.saved")}</span>
										</>
									)}
									{saveStatus === "saving" && (
										<>
											<Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
											<span>{t("taskModal.saving")}</span>
										</>
									)}
									{saveStatus === "unsaved" && (
										<>
											<Clock className="w-3.5 h-3.5 text-amber-400" />
											<span>{t("taskModal.unsaved")}</span>
										</>
									)}
									{saveStatus === "error" && (
										<>
											<AlertCircle className="w-3.5 h-3.5 text-rose-400" />
											<span>{t("taskModal.saveError")}</span>
										</>
									)}
								</button>
							) : (
								<button
									type="submit"
									disabled={isSaving}
									className="flex items-center space-x-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-md shadow-blue-600/30 transition-all disabled:opacity-50"
								>
									<Save className="w-4 h-4" />
									<span>
										{isSaving ? t("taskModal.saving") : t("taskModal.save")}
									</span>
								</button>
							)}

							{task && actionMenuGroups.length > 0 && (
								<ActionMenu
									triggerLabel={t("taskModal.actionsMenu")}
									triggerIcon={<MoreVertical className="w-5 h-5" />}
									groups={actionMenuGroups}
									onOpenChange={setIsMenuOpen}
								/>
							)}

							<button
								type="button"
								onClick={() => setIsMaximized(!isMaximized)}
								className="text-[var(--text-secondary)] hover:opacity-80 p-1.5 rounded-lg transition-colors"
								title={isMaximized ? t("modal.minimize") : t("modal.maximize")}
							>
								{isMaximized ? (
									<Minimize2 className="w-5 h-5" />
								) : (
									<Maximize2 className="w-5 h-5" />
								)}
							</button>
							<button
								type="button"
								onClick={handleCloseWithSave}
								className="text-[var(--text-secondary)] hover:opacity-80 p-1.5 rounded-lg transition-colors"
							>
								<X className="w-5 h-5" />
							</button>
						</div>
					</div>

					{/* Form Body */}
					<div className="p-4 sm:p-6 pb-8 sm:pb-12 space-y-4 overflow-y-auto flex-1 flex flex-col">
						{/* Title */}
						<div>
							<label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
								{t("taskModal.titleLabel")}{" "}
								<span className="text-rose-500">*</span>
							</label>
							<input
								type="text"
								required
								value={title}
								onChange={(e) => handleTitleChange(e.target.value)}
								placeholder="e.g. Implement authentication logic"
								className="w-full px-3.5 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
							/>
						</div>

						{/* Column Selector */}
						{columns.length > 0 && (
							<div>
								<label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
									<Columns className="w-3.5 h-3.5 text-[var(--text-muted)]" />{" "}
									カラム
								</label>
								<div className="relative flex items-center">
									<select
										value={columnId}
										onChange={(e) => handleColumnIdChange(e.target.value)}
										className="w-full py-2 px-3.5 pr-9 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500 appearance-none cursor-pointer font-medium"
									>
										{(Boolean(currentParentId) || !columnId) && (
											<option
												value=""
												className="bg-[var(--modal-bg)] text-[var(--text-muted)]"
											>
												-
											</option>
										)}
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
									<ChevronDown className="absolute right-3 w-4 h-4 text-[var(--text-secondary)] pointer-events-none" />
								</div>
							</div>
						)}

						{/* Custom Fields Section */}
						<CustomFieldsSection
							fields={customFieldsState}
							presetFields={customFields}
							modalInstanceId={modalInstanceId}
							isAddFieldOpen={isAddFieldOpen}
							onSetAddFieldOpen={setIsAddFieldOpen}
							onChangeFields={handleCustomFieldsChange}
							onDragStateChange={(isDragging) => {
								isDraggingCustomFieldRef.current = isDragging;
							}}
						/>

						{/* Unified Hierarchy (Subtasks & Parent) Section */}
						{task && (
							<TaskHierarchySection
								task={task}
								columns={columns}
								currentColumnId={columnId}
								currentParentId={currentParentId}
								parentTask={parentTask}
								subtasks={subtasks}
								subtaskActionTarget={subtaskActionTarget}
								onSetSubtaskActionTarget={setSubtaskActionTarget}
								isUnlinkParentModalOpen={isUnlinkParentModalOpen}
								onSetIsUnlinkParentModalOpen={setIsUnlinkParentModalOpen}
								onParentChange={(newParentId, newParentTask, newColumnId) => {
									setParentId(newParentId);
									setParentTask(newParentTask);
									if (newColumnId !== undefined) {
										setColumnId(newColumnId);
										latestStateRef.current = {
											...latestStateRef.current,
											columnId: newColumnId,
										};
										if (historyRef.current[historyIndexRef.current]) {
											historyRef.current[historyIndexRef.current] = {
												...historyRef.current[historyIndexRef.current],
												columnId: newColumnId,
											};
										}
									}
								}}
								onSubtasksChange={setSubtasks}
								onReloadHierarchy={reloadHierarchy}
								onSaveSubtasks={async (taskId, subtaskRefs) => {
									await onSave(
										{ id: taskId, subtasks: subtaskRefs },
										{ silent: true },
									);
								}}
								onRefreshBoard={handleRefreshBoard}
								onOpenTask={handleNavigateTask}
							/>
						)}

						{/* Tags */}
						<div>
							<label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
								<Tag className="w-3.5 h-3.5 text-[var(--text-muted)]" />{" "}
								{t("taskModal.tagsLabel")}
							</label>
							<TagInput
								tags={tags}
								onChange={handleTagsChange}
								availableTags={availableTags}
								placeholder={t("taskModal.tagsPlaceholder")}
							/>
						</div>

						{/* Content (Markdown Body) */}
						<div className="flex-1 flex flex-col min-h-[600px] relative">
							<label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center justify-between">
								<span className="flex items-center gap-1">
									<AlignLeft className="w-3.5 h-3.5 text-[var(--text-muted)]" />{" "}
									{t("taskModal.contentLabel")}
								</span>
								{isLoadingContent && (
									<span className="flex items-center gap-1 text-xs text-blue-500 font-normal normal-case">
										<Loader2 className="w-3 h-3 animate-spin" />
										<span>Loading...</span>
									</span>
								)}
							</label>
							<MarkdownEditor
								value={content}
								onChange={handleContentChange}
								placeholder={t("taskModal.contentPlaceholder")}
								onUndo={handleUndo}
								onRedo={handleRedo}
								canUndo={canUndo}
								canRedo={canRedo}
							/>
						</div>
					</div>
				</form>
			</div>
		</div>
	);
};
