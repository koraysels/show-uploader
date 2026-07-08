import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useDropzone } from 'react-dropzone';
import { useFileUpload, type FileUpload } from './useFileUpload';

type Ctx = FileUpload & { open: () => void };
const DropzoneContext = createContext<Ctx | null>(null);

export function useUploadContext(): Ctx {
  const ctx = useContext(DropzoneContext);
  if (!ctx) throw new Error('useUploadContext must be used inside FullPageDropzone');
  return ctx;
}

// Wraps the page so a video dropped ANYWHERE over it is uploaded. noClick keeps
// the form's own controls clickable; a full-screen overlay appears while dragging.
export function FullPageDropzone({
  onUploaded,
  children,
}: {
  onUploaded: (key: string) => void;
  children: ReactNode;
}) {
  const fu = useFileUpload(onUploaded);
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) void fu.upload(accepted[0]);
    },
    [fu]
  );
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    multiple: false,
    accept: { 'video/*': ['.mkv', '.mp4', '.mov', '.webm'] },
  });

  return (
    <div {...getRootProps({ className: 'relative min-h-screen' })}>
      <input {...getInputProps()} />
      <DropzoneContext.Provider value={{ ...fu, open }}>{children}</DropzoneContext.Provider>
      {isDragActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm pointer-events-none">
          <div className="border-2 border-dashed border-white/60 rounded-2xl px-16 py-12 text-center">
            <p className="text-lg font-medium text-white">Drop video to upload</p>
            <p className="text-sm text-gray-400 mt-1">MKV, MP4, MOV or WebM</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline control shown in the form: browse button + upload status/progress.
export function UploadControl() {
  const { status, progress, filename, error, open } = useUploadContext();
  return (
    <button
      type="button"
      onClick={() => status !== 'uploading' && open()}
      className="w-full border-2 border-dashed border-gray-700 rounded-lg p-8 text-center hover:border-gray-500 transition-colors disabled:cursor-default"
      disabled={status === 'uploading'}
    >
      {status === 'idle' && (
        <span className="text-gray-400 text-sm">Drop video anywhere, or click to browse</span>
      )}
      {status === 'uploading' && (
        <span className="block space-y-2">
          <span className="block text-gray-300 text-sm truncate">{filename}</span>
          <span className="block w-full bg-gray-800 rounded-full h-1.5">
            <span
              className="block bg-white h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </span>
          <span className="block text-gray-400 text-xs">{progress}% — uploading to storage</span>
        </span>
      )}
      {status === 'done' && <span className="text-green-400 text-sm">✓ {filename}</span>}
      {status === 'error' && (
        <span className="block space-y-1">
          <span className="block text-red-400 text-sm">Upload failed</span>
          <span className="block text-gray-500 text-xs">{error}</span>
          <span className="block text-gray-400 text-xs mt-2">Click to try again</span>
        </span>
      )}
    </button>
  );
}
