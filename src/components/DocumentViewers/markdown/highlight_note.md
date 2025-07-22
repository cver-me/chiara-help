# Markdown Highlighting & Note-Taking Implementation Plan

## 1. Data Model & Storage

### Firestore Structure

```
users/{userId}/docs/{docId}/
  └── annotations/ (subcollection)
      └── {annotationId}
          ├── type: "highlight" | "note" | "highlight-with-note"
          ├── color: string (for highlights)
          ├── text: string (selected text content)
          ├── note: string (note content, if applicable)
          ├── position: {
          │    startOffset: number
          │    endOffset: number
          │    paragraphIndex: number
          │    elementId: string (optional, for heading/list items)
          │    contextBefore: string (25-50 chars before selection)
          │    contextAfter: string (25-50 chars after selection)
          │ }
          ├── createdAt: timestamp
          └── updatedAt: timestamp
```

## 2. Frontend Implementation

### Core Components

#### 1. Text Selection & Highlighting Service

- Create a service to handle text selection mechanics
- Implement methods to accurately capture selection context for stability
- Add position calculation logic for proper re-rendering

#### 2. UI Components

- `HighlightMenu.jsx`: Context menu for highlight operations
- `MarkdownHighlighter.jsx`: Component to manage highlights overlay
- `MarkdownNotes.jsx`: Interface for note creation/editing
- `AnnotationsSidebar.jsx`: Panel to display/manage all annotations

#### 3. Integration with MarkdownViewer

- Enhance `MarkdownViewer.jsx` to detect and process text selections
- Modify rendering to apply highlight styles to annotated text
- Add hooks for rendering note indicators

## 3. Implementation Steps

### Phase 1: Core Infrastructure

1. Create Firestore service for annotations CRUD operations
2. Implement text selection handling and position calculation
3. Add highlight UI components and context menu

### Phase 2: Note-Taking Features

1. Create note editor component
2. Implement note creation/editing functionality
3. Add note indicators in the document

### Phase 3: Highlights Management

1. Create annotations sidebar/panel
2. Implement filtering and navigation between annotations
3. Add editing and deletion capabilities

### Phase 4: UI/UX Refinement

1. Add animations and transitions for a polished feel
2. Implement keyboard shortcuts for common operations
3. Add user preferences for highlight colors and styles

## 4. Technical Implementation Details

### Text Selection & Positioning

- Use `window.getSelection()` API to capture user selections
- Store sufficient context (text before/after) to re-locate positions
- Use paragraph indices and offsets for stable positioning

### Highlight Rendering

- Use DOM manipulation to apply highlights without re-rendering entire document
- Create highlight overlays positioned absolutely over the text
- Handle overlapping highlights with z-index management

### Notes UI

- Floating editor for quick notes
- Sidebar panel for longer editing sessions
- Support rich text formatting in notes

## 5. Technical Challenges & Solutions

### Challenge: Position Stability

**Solution:** Store paragraph index and context around selection to ensure highlights remain stable when document is re-rendered.

### Challenge: Rendering Performance

**Solution:** Use efficient DOM updates and virtual overlay approach instead of modifying the actual markdown content.

### Challenge: User Experience

**Solution:** Design intuitive UI with clear visual feedback and minimal friction when creating highlights/notes.

## 6. Features Roadmap

### MVP (Initial Release)

- Basic text highlighting with color options
- Simple note attachment to highlights
- Listing of all annotations in sidebar

### Future Enhancements

- Collaborative annotations (viewing others' annotations)
- Export/import annotations
- Search within annotations
- Annotation categories/tags
