
import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { BillList } from './components/BillList';
import { BillForm } from './components/BillForm';
import { GeminiInsights } from './components/GeminiInsights';
import { CategoryManager } from './components/CategoryManager';
import { CalendarView } from './components/CalendarView';
import { UserManager } from './components/UserManager';
import { CompanyManager } from './components/CompanyManager';
import { Bill, View, PaymentStatus, Category, User } from './types';
import { DEFAULT_CATEGORIES, DEFAULT_COMPANIES } from './constants';

import {
  subscribeToBills, addBill, updateBill as updateBillInDb, deleteBill as deleteBillInDb,
  subscribeToCategories, seedCategories,
  subscribeToCompanies, seedCompanies, addCompany as addCompanyToDb, updateCompany as updateCompanyInDb, deleteCompany as deleteCompanyInDb,
  subscribeToUsers, addUser as addUserToDb, updateUser as updateUserInDb, deleteUser as deleteUserInDb,
  loginUser, seedDefaultAdmin
} from './services/db';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>('dashboard');

  const [bills, setBills] = useState<Bill[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<string[]>(DEFAULT_COMPANIES);
  const [isLoaded, setIsLoaded] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);

  // Seed defaults on app start
  // Show login immediately, seed defaults in background
  useEffect(() => {
    setIsLoaded(true);
    // Fire-and-forget seeding (only seeds if collections are empty)
    seedDefaultAdmin().catch(e => console.warn("Admin seed:", e));
    seedCategories(DEFAULT_CATEGORIES).catch(e => console.warn("Category seed:", e));
    seedCompanies(DEFAULT_COMPANIES).catch(e => console.warn("Company seed:", e));
  }, []);

  // Data Subscriptions (active when logged in)
  useEffect(() => {
    if (!currentUser) {
      setBills([]);
      return;
    }

    // Subscribe to Bills
    const unsubBills = subscribeToBills((fetchedBills) => {
      const today = new Date().toISOString().split('T')[0];
      const processedBills = fetchedBills.map(bill => {
        let status = bill.status;
        if (status === PaymentStatus.PENDING && bill.dueDate < today) {
          status = PaymentStatus.OVERDUE;
        }
        return { ...bill, status, currency: bill.currency || 'USD' };
      });
      setBills(processedBills);
    }, (error) => {
      console.error("Database error:", error);
      alert(`Database Error: ${error.message}. Check Firestore rules.`);
    });

    // Subscribe to Categories
    const unsubCats = subscribeToCategories((fetchedCats) => {
      if (fetchedCats.length > 0) {
        setCategories(fetchedCats);
      }
      // If empty, DEFAULT_CATEGORIES remain (already set as initial state)
    });

    // Subscribe to Companies
    const unsubCompanies = subscribeToCompanies((fetchedCompanies) => {
      if (fetchedCompanies.length > 0) {
        setCompanies(fetchedCompanies);
      }
    });

    // Subscribe to Users
    const unsubUsers = subscribeToUsers((fetchedUsers) => {
      setUsers(fetchedUsers);
    });

    return () => {
      unsubBills();
      unsubCats();
      unsubCompanies();
      unsubUsers();
    };
  }, [currentUser]);

  // Login handler
  const handleLogin = async (username: string, password: string): Promise<boolean> => {
    try {
      const user = await loginUser(username, password);
      if (user) {
        setCurrentUser(user);
        setCurrentView('dashboard');
        return true;
      }
      return false;
    } catch (error) {
      console.error("Login error:", error);
      return false;
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('dashboard');
  };

  const handleSaveBill = async (bill: Bill) => {
    try {
      if (bill.id && bills.some(b => b.id === bill.id)) {
        await updateBillInDb(bill);
      } else {
        await addBill(bill);
      }
      setEditingBill(null);
      setCurrentView('bills');
    } catch (e: any) {
      console.error("Error saving bill", e);
      alert(`Failed to save bill: ${e?.message || 'Unknown error'}. Check Firebase Console.`);
    }
  };

  const handleDeleteBill = async (id: string) => {
    if (confirm("Are you sure you want to delete this bill?")) {
      try {
        await deleteBillInDb(id);
      } catch (e) {
        console.error("Delete failed", e);
      }
    }
  };

  // Company handlers
  const handleAddCompany = async (name: string) => {
    try {
      await addCompanyToDb(name);
    } catch (e: any) {
      alert(e.message || "Failed to add company");
    }
  };

  const handleUpdateCompany = async (oldName: string, newName: string) => {
    try {
      await updateCompanyInDb(oldName, newName);
    } catch (e) {
      console.error("Update company failed", e);
    }
  };

  const handleDeleteCompany = async (name: string) => {
    try {
      await deleteCompanyInDb(name);
    } catch (e) {
      console.error("Delete company failed", e);
    }
  };

  // User handlers
  const handleAddUser = async (user: User) => {
    try {
      await addUserToDb(user);
    } catch (e: any) {
      alert(e.message || "Failed to add user");
    }
  };

  const handleUpdateUser = async (user: User) => {
    try {
      await updateUserInDb(user);
      // If current user updated their own profile, refresh session
      if (user.id === currentUser?.id) {
        setCurrentUser(user);
      }
    } catch (e) {
      console.error("Update user failed", e);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (id === currentUser?.id) {
      alert("You cannot delete yourself.");
      return;
    }
    if (confirm("Are you sure you want to delete this user?")) {
      try {
        await deleteUserInDb(id);
      } catch (e) {
        console.error("Delete user failed", e);
      }
    }
  };

  const handleUpdateStatus = async (id: string, status: PaymentStatus) => {
    if (currentUser?.role === 'VIEWER') return;
    const bill = bills.find(b => b.id === id);
    if (bill) {
      await updateBillInDb({ ...bill, status });
    }
  };

  const startAddingBill = () => {
    setEditingBill(null);
    setCurrentView('add-bill');
  };

  const startEditingBill = (bill: Bill) => {
    setEditingBill(bill);
    setCurrentView('add-bill');
  };

  if (!isLoaded) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  // Render Login if no user
  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  // Permission Checks
  const canEdit = currentUser.role === 'ADMIN' || currentUser.role === 'EDITOR';
  const isAdmin = currentUser.role === 'ADMIN';

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard bills={bills} onAddBill={startAddingBill} currentUser={currentUser} />;
      case 'bills':
        return <BillList
          bills={bills}
          onUpdateStatus={handleUpdateStatus}
          onEdit={startEditingBill}
          onDelete={handleDeleteBill}
          currentUser={currentUser}
        />;
      case 'add-bill':
        return canEdit ?
          <BillForm
            categories={categories}
            companies={companies}
            onAddCompany={handleAddCompany}
            onSubmit={handleSaveBill}
            onCancel={() => {
              setEditingBill(null);
              setCurrentView('bills');
            }}
            initialData={editingBill || undefined}
          /> :
          <div className="p-4 text-center text-red-500">Unauthorized Access</div>;
      case 'categories':
        return isAdmin ?
          <CategoryManager categories={categories} setCategories={setCategories} /> :
          <div className="p-4 text-center text-red-500">Unauthorized Access</div>;
      case 'companies':
        return isAdmin ?
          <CompanyManager
            companies={companies}
            onAdd={handleAddCompany}
            onUpdate={handleUpdateCompany}
            onDelete={handleDeleteCompany}
          /> :
          <div className="p-4 text-center text-red-500">Unauthorized Access</div>;
      case 'users':
        return isAdmin ?
          <UserManager
            users={users}
            currentUser={currentUser}
            onAddUser={handleAddUser}
            onUpdateUser={handleUpdateUser}
            onDeleteUser={handleDeleteUser}
          /> :
          <div className="p-4 text-center text-red-500">Unauthorized Access</div>;
      case 'calendar':
        return <CalendarView bills={bills} />;
      case 'insights':
        return <GeminiInsights bills={bills} />;
      default:
        return <Dashboard bills={bills} onAddBill={startAddingBill} currentUser={currentUser} />;
    }
  };

  return (
    <Layout currentView={currentView} setCurrentView={setCurrentView} currentUser={currentUser} onLogout={handleLogout}>
      {renderContent()}
    </Layout>
  );
};

export default App;
