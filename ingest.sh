#!/bin/bash

# Delete the existing digest.txt if it exists
if [ -f "digest.txt" ]; then
    echo "Deleting existing digest.txt..."
    rm "digest.txt"
fi

# Run gitingest to generate digest.txt
echo "Running..."
gitingest . --exclude-pattern ingest.sh --exclude-pattern editor.html --exclude-pattern preview.html --exclude-pattern digestold.txt

# Wait a moment to ensure digest.txt is created
sleep 0.1

DIGEST_FILE="digest.txt"

# Check if the file exists
if [ -f "$DIGEST_FILE" ]; then
    # Read the content of digest.txt
    DIGEST_CONTENT=$(cat "$DIGEST_FILE")

    # Format the content with only client codebase
    FORMATTED_CONTENT="<goal>
 
</goal>

<output_requirements>
- Don't be lazy, provide thorough, high-quality code.
- Provide complete file contents for any modified or new files.
- Write clean, well-documented code with appropriate error handling.
- Never use ellipsis (...) or placeholder comments, as an excuse to omit code for brewity.
</output_requirements>

<context>
    <codebase>
$DIGEST_CONTENT
    </codebase>
</context>"

    # Overwrite digest.txt with the formatted content
    echo "$FORMATTED_CONTENT" > "$DIGEST_FILE"

    echo "digest.txt formatted!"
else
    echo "Error: digest.txt not found."
fi
