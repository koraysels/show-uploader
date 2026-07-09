import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { AuthProvider } from './auth/AuthProvider';
import { UploadProvider } from './upload/UploadProvider';
import { router } from './router';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UploadProvider>
          <RouterProvider router={router} />
        </UploadProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
