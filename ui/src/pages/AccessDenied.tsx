export default function AccessDenied() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-lg font-medium">Access pending approval</p>
        <p className="text-sm text-gray-400">
          Ask an admin to grant you the{' '}
          <span className="font-mono text-white">member</span> role in Zitadel.
        </p>
      </div>
    </div>
  );
}
