/**
 * fileActions.test.js
 *
 * Validates the regex-based file action detection patterns used by
 * prismaChat.service.ts, exercised here as plain JS so we can run
 * them inside the existing react-scripts / Jest setup.
 */

/* ---- detection logic (mirrors backend detectFileAction) ---- */

function detectFileAction(message) {
  const msg = message.trim();

  // 1. create_folder
  const createMatch = msg.match(
    /\b(create|make|add|new)\b.{0,20}\b(folder|directory)\b\s+(?:(?:called|named|titled)\s+)?["']?([^"'\n]{2,60})["']?\s*$/i
  );
  if (createMatch) {
    return { type: "create_folder", folderName: createMatch[3].trim() };
  }

  // 2. rename_folder
  const renameMatch = msg.match(
    /\b(rename|change\s+(?:the\s+)?name\s+of)\b.*?\b(folder)\b\s+["']?(.+?)["']?\s+to\s+["']?(.+?)["']?\s*$/i
  );
  if (renameMatch) {
    return {
      type: "rename_folder",
      folderName: renameMatch[3].trim(),
      newName: renameMatch[4].trim(),
    };
  }

  // 3. delete_folder
  const deleteFolderMatch = msg.match(
    /\b(delete|remove|trash)\b.*?\b(folder|directory)\b\s+["']?([^"'\n]{2,60})["']?\s*$/i
  );
  if (deleteFolderMatch) {
    return { type: "delete_folder", folderName: deleteFolderMatch[3].trim() };
  }

  // 4. move_document
  const moveMatch = msg.match(
    /\b(move|transfer|put)\b\s+["']?(.+?\.\w{2,5})["']?\s+(?:to|into|in)\s+(?:the\s+)?(?:folder\s+)?["']?([^"'\n]{2,60}?)["']?(?:\s+folder)?\s*$/i
  );
  if (moveMatch) {
    return {
      type: "move_document",
      filename: moveMatch[2].trim(),
      targetFolder: moveMatch[3].trim(),
    };
  }

  // 5. delete_document
  const deleteDocMatch = msg.match(
    /\b(delete|remove|trash)\b\s+(?:the\s+)?(?:file\s+)?["']?(.+?\.\w{2,5})["']?\s*$/i
  );
  if (deleteDocMatch) {
    return { type: "delete_document", filename: deleteDocMatch[2].trim() };
  }

  return null;
}

/* ---- tests ---- */

describe("File Action Detection — single conversation flow", () => {
  // Simulates one user session typing commands sequentially

  const conversation = [
    // Step 1 – create folder
    {
      input: "Create a folder called Reports",
      expected: { type: "create_folder", folderName: "Reports" },
    },
    // Step 2 – normal question (should NOT match)
    {
      input: "What are the key takeaways from the budget?",
      expected: null,
    },
    // Step 3 – move document into the new folder
    {
      input: "Move report.pdf to the Reports folder",
      expected: {
        type: "move_document",
        filename: "report.pdf",
        targetFolder: "Reports",
      },
    },
    // Step 4 – rename the folder
    {
      input: "Rename the folder Reports to Monthly Reports",
      expected: {
        type: "rename_folder",
        folderName: "Reports",
        newName: "Monthly Reports",
      },
    },
    // Step 5 – delete a document
    {
      input: "Delete report.pdf",
      expected: { type: "delete_document", filename: "report.pdf" },
    },
    // Step 6 – delete the folder
    {
      input: "Delete the folder Monthly Reports",
      expected: { type: "delete_folder", folderName: "Monthly Reports" },
    },
    // Step 7 – another normal question (should NOT match)
    {
      input: "Summarize the Q4 revenue numbers",
      expected: null,
    },
  ];

  test.each(conversation.map((c, i) => [i + 1, c.input, c.expected]))(
    "Step %i: %s",
    (_step, input, expected) => {
      const result = detectFileAction(input);
      if (expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).toMatchObject(expected);
      }
    }
  );
});

describe("File Action Detection — variant phrasings", () => {
  test("make a new folder named Q4 2026", () => {
    const r = detectFileAction("Make a new folder named Q4 2026");
    expect(r).toMatchObject({ type: "create_folder", folderName: "Q4 2026" });
  });

  test("add a folder called Drafts", () => {
    const r = detectFileAction("Add a folder called Drafts");
    expect(r).toMatchObject({ type: "create_folder", folderName: "Drafts" });
  });

  test("create folder 'My Documents'", () => {
    const r = detectFileAction("Create folder 'My Documents'");
    expect(r).toMatchObject({ type: "create_folder", folderName: "My Documents" });
  });

  test("remove folder Old Files", () => {
    const r = detectFileAction("Remove folder Old Files");
    expect(r).toMatchObject({ type: "delete_folder", folderName: "Old Files" });
  });

  test("trash the folder Temp", () => {
    const r = detectFileAction("Trash the folder Temp");
    expect(r).toMatchObject({ type: "delete_folder", folderName: "Temp" });
  });

  test("put analysis.xlsx in Q4", () => {
    const r = detectFileAction("Put analysis.xlsx in Q4");
    expect(r).toMatchObject({
      type: "move_document",
      filename: "analysis.xlsx",
      targetFolder: "Q4",
    });
  });

  test("transfer budget_v2.docx into the folder Finance", () => {
    const r = detectFileAction("Transfer budget_v2.docx into the folder Finance");
    expect(r).toMatchObject({
      type: "move_document",
      filename: "budget_v2.docx",
      targetFolder: "Finance",
    });
  });

  test("remove the file analysis.xlsx", () => {
    const r = detectFileAction("Remove the file analysis.xlsx");
    expect(r).toMatchObject({ type: "delete_document", filename: "analysis.xlsx" });
  });

  test("delete summary_final.pdf", () => {
    const r = detectFileAction("Delete summary_final.pdf");
    expect(r).toMatchObject({ type: "delete_document", filename: "summary_final.pdf" });
  });

  test("change the name of folder Archive to Old Archive", () => {
    const r = detectFileAction("Change the name of folder Archive to Old Archive");
    expect(r).toMatchObject({
      type: "rename_folder",
      folderName: "Archive",
      newName: "Old Archive",
    });
  });
});

describe("File Action Detection — should NOT match", () => {
  const nonActions = [
    "Tell me about the folder structure in report.pdf",
    "What folders are mentioned in the document?",
    "How do I create a chart?",
    "Can you summarize the deleted items section?",
    "Show me the report on folder organization best practices",
    "Open the budget spreadsheet",
    "What is the total revenue?",
    "List all documents",
  ];

  test.each(nonActions)("'%s' → null", (input) => {
    expect(detectFileAction(input)).toBeNull();
  });
});
