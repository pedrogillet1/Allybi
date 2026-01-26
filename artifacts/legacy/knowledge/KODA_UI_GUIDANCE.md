# KODA UI GUIDANCE KNOWLEDGE BASE

Complete UI documentation for Koda's product help system.
**Note:** This knowledge base excludes Plans, Settings, Integrations, and Limits sections.

---

## 1. AUTHENTICATION & ONBOARDING

### 1.1 Login Page

**Purpose:** Allow users to access their Koda account

**URL:** `/login`

**Elements:**
- Email input field
- Password input field
- "Login" button (primary action)
- "Forgot password?" link
- "Create account" link
- Social login options (Google, Microsoft)

**Actions:**
- Enter credentials and click "Login" to access account
- Click "Forgot password?" to reset password via email
- Click "Create account" to register new account

**Validation:**
- Email must be valid format
- Password required (minimum 8 characters)

### 1.2 Signup Page

**Purpose:** Create a new Koda account

**URL:** `/signup`

**Elements:**
- Full name input
- Email input
- Password input
- Confirm password input
- "Create Account" button
- Terms of service checkbox
- "Already have an account?" link

**Actions:**
- Fill all fields and click "Create Account"
- Check terms of service to proceed
- Click login link to go to login page

### 1.3 Password Reset

**Purpose:** Recover account access

**Elements:**
- Email input
- "Send Reset Link" button
- Back to login link

**Flow:**
1. Enter email address
2. Click "Send Reset Link"
3. Check email for reset link
4. Click link and set new password

### 1.4 Email Verification

**Purpose:** Verify user email address

**Flow:**
1. After signup, verification email is sent
2. Click verification link in email
3. Account is activated
4. Redirect to login page

---

## 2. MAIN APPLICATION INTERFACE

### 2.1 Chat Interface

**Purpose:** Primary interface for asking questions and interacting with documents

**Location:** Main content area (center of screen)

**Elements:**
- Message input field (bottom)
- Send button
- Voice input button (microphone icon)
- Message history (scrollable)
- New chat button
- Conversation title

**Actions:**
- Type question and press Enter or click Send
- Click microphone for voice input
- Click "New Chat" to start fresh conversation
- Scroll to view previous messages
- Click on citations to view source documents

**Message Types:**
- User messages (right-aligned, colored background)
- Assistant messages (left-aligned, white background)
- System messages (centered, gray)
- Loading indicator (typing animation)

**Keyboard Shortcuts:**
- Enter: Send message
- Shift+Enter: New line in message
- Escape: Clear input

### 2.2 Left Navigation Sidebar

**Purpose:** Navigate between main sections and conversations

**Location:** Left side of screen

**Elements:**
- Koda logo (top)
- "New Chat" button
- Conversation history list
- "Documents" navigation link
- "Folders" navigation link
- User profile (bottom)
- Collapse/expand toggle

**Actions:**
- Click "New Chat" to start new conversation
- Click conversation to resume it
- Click "Documents" to view document library
- Click "Folders" to view folder structure
- Click profile to access user menu
- Click toggle to collapse/expand sidebar

**Conversation List:**
- Shows recent conversations
- Displays conversation title (auto-generated or custom)
- Shows date of last activity
- Right-click for context menu (rename, delete)

### 2.3 Header Bar

**Purpose:** Quick actions and global navigation

**Location:** Top of screen

**Elements:**
- Search bar (global search)
- Upload button
- Notifications bell
- User avatar/menu

**Actions:**
- Type in search bar to search across documents and conversations
- Click Upload to add new documents
- Click bell to view notifications
- Click avatar to access user menu

---

## 3. DOCUMENT MANAGEMENT

### 3.1 Document Library

**Purpose:** View and manage all uploaded documents

**URL:** `/documents`

**Elements:**
- Document grid/list view toggle
- Sort dropdown (date, name, type)
- Filter options
- Search bar
- Document cards/rows
- Bulk action toolbar (when items selected)

**Document Card Elements:**
- Document thumbnail/icon
- Document name
- File type badge
- Upload date
- File size
- Checkbox for selection
- Quick actions menu (three dots)

**Actions:**
- Click document to open preview
- Click checkbox to select for bulk actions
- Click three dots for context menu
- Use sort/filter to organize view
- Search to find specific documents

**Bulk Actions:**
- Move to folder
- Delete selected
- Download selected
- Add tags

### 3.2 Upload Modal

**Purpose:** Upload new documents to Koda

**Trigger:** Click "Upload" button in header or sidebar

**Elements:**
- Drag and drop zone
- "Browse Files" button
- Selected files list
- Progress bar (during upload)
- Cancel button
- Upload button

**Supported Formats:**
- PDF (.pdf)
- Word (.doc, .docx)
- Excel (.xls, .xlsx)
- PowerPoint (.ppt, .pptx)
- Text (.txt)
- CSV (.csv)
- Images (.png, .jpg, .jpeg, .gif)

**Maximum File Size:** 50MB per file

**Actions:**
- Drag files onto drop zone
- Click "Browse Files" to open file picker
- Click X on file to remove from list
- Click "Upload" to start upload
- Click "Cancel" to close modal

**Upload Process:**
1. Select files
2. Click Upload
3. Files are processed (OCR, text extraction)
4. Progress bar shows status
5. Success message when complete
6. Documents appear in library

### 3.3 Document Preview

**Purpose:** View document content without downloading

**Trigger:** Click on document in library

**Elements:**
- Document viewer (rendered content)
- Page navigation (for multi-page docs)
- Zoom controls
- Download button
- Close button
- Document info panel

**Actions:**
- Navigate pages using arrows or page input
- Zoom in/out using +/- buttons
- Download original file
- Close preview to return to library

### 3.4 Document Actions

**Available Actions:**
- **View/Preview:** Open document in viewer
- **Download:** Download original file
- **Rename:** Change document name
- **Move:** Move to different folder
- **Delete:** Remove from library (with confirmation)
- **Add Tags:** Apply tags for organization

**Access Methods:**
- Right-click on document
- Click three-dot menu on document card
- Select and use bulk action toolbar

---

## 4. FOLDER & ORGANIZATION

### 4.1 Folder Navigation

**Purpose:** Organize documents into hierarchical folders

**URL:** `/folders`

**Elements:**
- Folder tree (left panel)
- Folder contents (right panel)
- New folder button
- Breadcrumb navigation
- Current folder path

**Actions:**
- Click folder to view contents
- Click arrow to expand/collapse folder tree
- Click "New Folder" to create folder
- Drag documents to move between folders

### 4.2 Folder Tree View

**Purpose:** Visual hierarchy of all folders

**Elements:**
- Expandable folder nodes
- Document count badges
- Folder icons
- Drag handles

**Actions:**
- Click folder name to navigate
- Click arrow to expand children
- Drag folder to reorganize
- Right-click for context menu

### 4.3 Create Folder Modal

**Purpose:** Create new folder for organization

**Trigger:** Click "New Folder" button

**Elements:**
- Folder name input
- Parent folder selector
- Create button
- Cancel button

**Actions:**
- Enter folder name
- Select parent folder (optional)
- Click "Create" to add folder

### 4.4 Move Document Modal

**Purpose:** Move documents to different folder

**Trigger:** Select "Move" from document actions

**Elements:**
- Folder tree selector
- Current location indicator
- Move button
- Cancel button

**Actions:**
- Select destination folder
- Click "Move" to relocate document

---

## 5. CHAT & CONVERSATION

### 5.1 New Conversation

**How to Start:**
1. Click "New Chat" in sidebar
2. Or navigate to `/chat/new`

**Initial State:**
- Empty message area
- Suggested prompts (optional)
- Welcome message from Koda

### 5.2 Message Input

**Location:** Bottom of chat interface

**Elements:**
- Text input field (expandable)
- Send button
- Voice input button
- Attachment button (if enabled)

**Features:**
- Auto-resize as you type
- Supports multi-line input
- Character limit indicator
- Markdown formatting support

### 5.3 Assistant Responses

**Response Types:**
- Text answers
- Bulleted/numbered lists
- Tables (for structured data)
- Code blocks (for technical content)
- Citations (links to source documents)

**Citation Format:**
- Inline citations [1], [2], etc.
- Citation list at bottom of response
- Click citation to view source document

### 5.4 Conversation History

**Location:** Left sidebar

**Features:**
- Auto-saved conversations
- Searchable history
- Rename conversations
- Delete conversations
- Resume any past conversation

**Management:**
- Right-click conversation for options
- Click to resume conversation
- Search bar to find by keyword

### 5.5 Voice Input

**Trigger:** Click microphone button

**Process:**
1. Click microphone icon
2. Speak your question
3. Speech is transcribed
4. Review and edit if needed
5. Send message

**Requirements:**
- Microphone permission
- Supported browser (Chrome, Firefox, Safari, Edge)

---

## 6. SEARCH FUNCTIONALITY

### 6.1 Global Search

**Location:** Header search bar

**Purpose:** Search across all documents and conversations

**Features:**
- Real-time suggestions
- Document results
- Conversation results
- Recent searches

**Actions:**
- Type query to search
- Click result to navigate
- Press Enter to see all results

### 6.2 Document Search

**Location:** Document library search bar

**Purpose:** Filter documents by name or content

**Features:**
- Search by document name
- Search within document content
- Filter by file type
- Filter by date range
- Filter by folder

### 6.3 Search in Chat

**Purpose:** Find information using natural language

**How to Use:**
1. Type your question in chat
2. Koda searches your documents
3. Relevant information is returned
4. Citations show source documents

**Tips:**
- Be specific for better results
- Ask follow-up questions to refine
- Mention document name if known

---

## 7. NOTIFICATIONS & ALERTS

### 7.1 Notification Center

**Location:** Bell icon in header

**Purpose:** View system notifications and alerts

**Notification Types:**
- Upload complete
- Processing complete
- Errors and warnings
- System announcements

**Actions:**
- Click bell to open notification panel
- Click notification to view details
- Click "Mark all read" to clear badges
- Click X to dismiss notification

### 7.2 Toast Notifications

**Purpose:** Temporary status messages

**Location:** Bottom-right corner

**Types:**
- Success (green)
- Error (red)
- Warning (yellow)
- Info (blue)

**Behavior:**
- Auto-dismiss after 5 seconds
- Click X to dismiss immediately
- Stack if multiple notifications

---

## 8. MODALS & DIALOGS

### 8.1 Confirmation Dialogs

**Purpose:** Confirm destructive actions

**Examples:**
- Delete document confirmation
- Delete folder confirmation
- Clear conversation confirmation

**Elements:**
- Warning icon
- Confirmation message
- Cancel button
- Confirm button (destructive action)

### 8.2 Error Dialogs

**Purpose:** Display error messages

**Elements:**
- Error icon
- Error message
- Details (if available)
- Close button
- Retry button (if applicable)

### 8.3 Success Dialogs

**Purpose:** Confirm successful operations

**Elements:**
- Success icon
- Success message
- Close button
- Next action button (optional)

---

## 9. KEYBOARD SHORTCUTS

### Global Shortcuts
- `/` - Focus search bar
- `Ctrl/Cmd + K` - Open command palette
- `Ctrl/Cmd + /` - Show keyboard shortcuts

### Chat Shortcuts
- `Enter` - Send message
- `Shift + Enter` - New line
- `Escape` - Clear input
- `Up Arrow` - Edit last message

### Document Shortcuts
- `Delete` - Delete selected documents
- `Ctrl/Cmd + A` - Select all
- `Escape` - Deselect all

---

## 10. MOBILE EXPERIENCE

### Responsive Design
- Sidebar collapses to hamburger menu
- Full-width chat interface
- Touch-friendly buttons
- Swipe gestures for navigation

### Mobile-Specific Features
- Pull-to-refresh
- Tap-to-upload
- Voice input (tap and hold)
- Pinch-to-zoom in document viewer

### Mobile Limitations
- Some keyboard shortcuts unavailable
- Drag-and-drop may require tap-hold
- File upload via camera or files app

---

## 11. ACCESSIBILITY

### Screen Reader Support
- All interactive elements labeled
- Headings for navigation
- ARIA attributes on dynamic content
- Skip navigation links

### Keyboard Navigation
- Tab order follows visual layout
- Focus indicators visible
- All functions accessible via keyboard
- Escape closes modals

### Visual Accommodations
- High contrast mode support
- Scalable text (respects browser settings)
- Color not sole indicator of state
- Sufficient color contrast ratios

---

## 12. ERROR STATES

### Common Errors

**Upload Failed:**
- Check file format is supported
- Check file size under 50MB
- Try uploading again
- Contact support if persists

**Document Not Found:**
- Document may have been deleted
- Check folder location
- Search by document name
- Re-upload if necessary

**Search No Results:**
- Try different keywords
- Check spelling
- Broaden search terms
- Ensure documents are processed

**Network Error:**
- Check internet connection
- Refresh the page
- Try again in a few moments
- Contact support if persists

---

## 13. GETTING HELP

### In-App Help
- Click "?" icon for contextual help
- Tooltips on hover
- Guided tours for new users

### Support Channels
- In-app chat support
- Email support
- Help documentation
- FAQ section

### Reporting Issues
- Use "Report a Problem" option
- Include error messages
- Describe steps to reproduce
- Attach screenshots if helpful
