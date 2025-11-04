import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import Index from "./pages/Index";
import Iparlux from "./pages/Iparlux";
import Auth from "./pages/Auth";
import Pricing from "./pages/Pricing";
import Settings from "./pages/Settings";
import AmazonConnector from "./pages/AmazonConnector";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/amazon-connector" element={<AmazonConnector />} />
        
        {/* Protected routes with sidebar */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Index />} />
          <Route path="/iparlux" element={<Iparlux />} />
        </Route>
        
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
