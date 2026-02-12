import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import PrivateRoute from "@/components/PrivateRoute";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import LandingPage from "@/pages/LandingPage";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminQuotesPage from "@/pages/admin/Quotes";
import AdminPoliciesPage from "@/pages/admin/Policies";
import ManagementPage from "@/pages/admin/Management";
import AdminEmployeesPage from "@/pages/admin/Employees";
import AdminSubAgentsPage from "@/pages/admin/SubAgents"; // Import the SubAgents page
import UsersPage from "@/pages/admin/Users";
import EmployeeDashboard from "@/pages/employee/Dashboard";
import EmployeeQuoteDetail from "@/pages/employee/QuoteDetail";
import EmployeeNewQuote from "@/pages/employee/NewQuote";
import EmployeeQuotesPage from "@/pages/employee/Quotes";
import EmployeePoliciesPage from "@/pages/employee/Policies";
import EmployeePolicyDetail from "@/pages/employee/PolicyDetail";
import WhatsAppMessages from "@/pages/employee/WhatsAppMessages";
import WhatsAppConnection from "@/pages/employee/WhatsAppConnection";
import SubAgentDashboard from "@/pages/sub-agent/Dashboard";
import NewQuote from "@/pages/sub-agent/NewQuote";
import SubAgentQuoteDetail from "@/pages/sub-agent/QuoteDetail";
import Unauthorized from "@/pages/Unauthorized";

import { Toaster } from 'react-hot-toast';

import EmployeePolicyCut from "@/pages/employee/PolicyCut";
import EmployeeRenewalsPage from "@/pages/employee/Renewals";
import EmployeeExpiredPoliciesPage from "@/pages/employee/ExpiredPolicies";
import AIChatWidget from "@/components/AIChatWidget";

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <Toaster position="top-right" />
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/unauthorized" element={<Unauthorized />} />
            <Route path="/" element={<LandingPage />} />
            
            <Route element={<PrivateRoute />}>
              <Route element={<Layout />}>
                {/* Admin Routes */}
                <Route element={<PrivateRoute allowedRoles={['admin']} />}>
                  <Route path="/admin/dashboard" element={<AdminDashboard />} />
                  <Route path="/admin/users" element={<UsersPage />} />
                  <Route path="/admin/employees" element={<AdminEmployeesPage />} />
                  <Route path="/admin/management" element={<ManagementPage />} />
                  <Route path="/admin/quotes" element={<AdminQuotesPage />} />
                  <Route path="/admin/policies" element={<AdminPoliciesPage />} />
                  <Route path="/admin/sub-agents" element={<AdminSubAgentsPage />} />
                  <Route path="/admin/whatsapp-connection" element={<WhatsAppConnection />} />
                </Route>

                {/* Employee Routes */}
                <Route element={<PrivateRoute allowedRoles={['employee', 'admin']} />}>
                  <Route path="/employee/dashboard" element={<EmployeeDashboard />} />
                  <Route path="/employee/messages" element={<WhatsAppMessages />} />
                  <Route path="/employee/whatsapp-connection" element={<WhatsAppConnection />} />
                  <Route path="/employee/quotes" element={<EmployeeQuotesPage />} />
                  <Route path="/employee/quotes/new" element={<EmployeeNewQuote />} />
                  <Route path="/employee/quotes/:id" element={<EmployeeQuoteDetail />} />
                  <Route path="/employee/policies/cut/:id" element={<EmployeePolicyCut />} /> {/* New Route */}
                  <Route path="/employee/renewals" element={<EmployeeRenewalsPage />} /> {/* New Route */}
                  <Route path="/employee/expired-policies" element={<EmployeeExpiredPoliciesPage />} />
                  <Route path="/employee/policies" element={<EmployeePoliciesPage />} />
                  <Route path="/employee/policies/:id" element={<EmployeePolicyDetail />} />
                </Route>

                {/* Sub-Agent Routes */}
                <Route element={<PrivateRoute allowedRoles={['sub_agent', 'admin']} />}>
                  <Route path="/sub-agent/dashboard" element={<SubAgentDashboard />} />
                  <Route path="/sub-agent/quotes" element={<div>Tekliflerim (Liste)</div>} />
                  <Route path="/sub-agent/quotes/new" element={<NewQuote />} />
                  <Route path="/sub-agent/quotes/:id" element={<SubAgentQuoteDetail />} />
                  <Route path="/sub-agent/policies" element={<div>Poliçelerim (Liste)</div>} />
                </Route>
              </Route>
            </Route>
          </Routes>
          <AIChatWidget />
        </Router>
      </NotificationProvider>
    </AuthProvider>
  );
}
