import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const validExtensions = ['.stl', '.obj', '.3mf'];
    const fileName = file.name.toLowerCase();
    const isValidFile = validExtensions.some(ext => fileName.endsWith(ext));

    if (!isValidFile) {
      return NextResponse.json(
        { error: 'Invalid file type. Only STL, OBJ, and 3MF files are allowed.' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Ensure the stl-temp directory exists
    const uploadDir = path.join(process.cwd(), 'public', 'stl-temp');
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Create unique filename with timestamp
    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}-${file.name}`;
    const filePath = path.join(uploadDir, uniqueFileName);

    // Write the file
    await writeFile(filePath, buffer);

    // Return success response with file metadata
    return NextResponse.json({
      success: true,
      fileName: uniqueFileName,
      originalName: file.name,
      size: file.size,
      path: `/stl-temp/${uniqueFileName}`
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
