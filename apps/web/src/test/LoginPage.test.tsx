import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginPage } from '../features/auth/LoginPage';
import { AuthContext, type AuthContextValue } from '../providers/AuthContext';

describe('LoginPage Component', () => {
  const mockLogin = vi.fn();
  const mockLoginWithOAuth = vi.fn();
  const mockLogout = vi.fn();
  const mockLogoutAll = vi.fn();
  const mockRefreshUser = vi.fn();

  const createAuthContextValue = (overrides?: Partial<AuthContextValue>): AuthContextValue => ({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    login: mockLogin,
    loginWithOAuth: mockLoginWithOAuth,
    logout: mockLogout,
    logoutAll: mockLogoutAll,
    refreshUser: mockRefreshUser,
    ...overrides,
  });

  const renderWithAuth = (
    ui: React.ReactElement,
    authOverrides?: Partial<AuthContextValue>
  ) => {
    const authValue = createAuthContextValue(authOverrides);
    return render(
      <AuthContext.Provider value={authValue}>
        {ui}
      </AuthContext.Provider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders branding, title, inputs, social sign-in buttons (Google & Microsoft only), and footer', () => {
    renderWithAuth(<LoginPage />);

    // Branding
    expect(screen.getByRole('heading', { level: 1, name: /ml platform/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /sign in to your account/i })).toBeInTheDocument();

    // Inputs
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();

    // Checkbox and links
    expect(screen.getByRole('checkbox', { name: /remember me/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /forgot password\?/i })).toBeInTheDocument();

    // Sign in button
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();

    // Social providers: Google and Microsoft exist, GitHub is omitted
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /microsoft/i })).toBeInTheDocument();
    expect(screen.queryByTitle(/sign in with github/i)).not.toBeInTheDocument();

    // Mode switch & Demo fill
    expect(screen.getByRole('button', { name: /^sign up$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fill demo credentials/i })).toBeInTheDocument();

    // Footer
    expect(screen.getByText(/privacy policy/i)).toBeInTheDocument();
    expect(screen.getByText(/terms of service/i)).toBeInTheDocument();
    expect(screen.getByText(/© 2026 ml platform inc\./i)).toBeInTheDocument();
  });

  it('toggles between Sign In and Sign Up modes', () => {
    renderWithAuth(<LoginPage />);

    // Initially in Sign In mode
    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument();

    // Switch to Sign Up
    fireEvent.click(screen.getByRole('button', { name: /^sign up$/i }));

    expect(screen.getByRole('heading', { level: 2, name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^create account$/i })).toBeInTheDocument();

    // Switch back to Sign In
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(screen.getByRole('heading', { level: 2, name: /sign in to your account/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument();
  });

  it('toggles password visibility when clicking the eye button', () => {
    renderWithAuth(<LoginPage />);

    const passwordInput = screen.getByLabelText(/^password/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    const toggleButton = screen.getByTitle(/show password/i);
    fireEvent.click(toggleButton);

    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByTitle(/hide password/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTitle(/hide password/i));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('populates credentials when clicking Fill Demo Credentials', () => {
    renderWithAuth(<LoginPage />);

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/^password/i);

    expect(emailInput).toHaveValue('');
    expect(passwordInput).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: /fill demo credentials/i }));

    expect(emailInput).toHaveValue('faculty_test@university.edu');
    expect(passwordInput).toHaveValue('DemoPassword123!');
  });

  it('submits login form and calls onSuccess on success', async () => {
    const handleSuccess = vi.fn();
    mockLogin.mockResolvedValueOnce(undefined);

    renderWithAuth(<LoginPage onSuccess={handleSuccess} />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'faculty_test@university.edu' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'DemoPassword123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        username: 'faculty_test@university.edu',
        password: 'DemoPassword123!',
      });
      expect(handleSuccess).toHaveBeenCalled();
    });
  });

  it('opens Google Account Chooser modal, selects account, and submits password', async () => {
    const handleSuccess = vi.fn();
    mockLoginWithOAuth.mockResolvedValueOnce(undefined);

    renderWithAuth(<LoginPage onSuccess={handleSuccess} />);

    // Click Google OAuth button
    const googleBtn = screen.getByRole('button', { name: /google/i });
    fireEvent.click(googleBtn);

    // Assert Google modal opened
    expect(screen.getByRole('dialog', { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.getByText('Rushil Mehta')).toBeInTheDocument();
    expect(screen.getByText('mehtarushil45@gmail.com')).toBeInTheDocument();

    // Select account
    fireEvent.click(screen.getByText('mehtarushil45@gmail.com'));

    // Assert Step 2 (Password entry)
    expect(screen.getByLabelText(/enter your password/i)).toBeInTheDocument();

    // Enter password and submit
    fireEvent.change(screen.getByLabelText(/enter your password/i), {
      target: { value: 'MySecretGooglePassword123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));

    await waitFor(() => {
      expect(mockLoginWithOAuth).toHaveBeenCalledWith('google', {
        email: 'mehtarushil45@gmail.com',
        full_name: 'Rushil Mehta',
      });
      expect(handleSuccess).toHaveBeenCalled();
    });
  });

  it('opens Microsoft Account Chooser modal and renders Microsoft accounts', () => {
    renderWithAuth(<LoginPage />);

    const msftBtn = screen.getByRole('button', { name: /microsoft/i });
    fireEvent.click(msftBtn);

    expect(screen.getByRole('dialog', { name: /sign in with microsoft/i })).toBeInTheDocument();
    expect(screen.getByText('Pick an account')).toBeInTheDocument();
    expect(screen.getByText('mehtarushil45@outlook.com')).toBeInTheDocument();
    expect(screen.getByText('faculty_test@university.edu')).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByTitle(/close dialog/i));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('displays error message banner when login fails', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid email or password'));

    renderWithAuth(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'wrong@user.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'badpassword' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
    });
  });

  it('navigates back to workspace when clicking Back to Platform', () => {
    const handleNavigate = vi.fn();
    renderWithAuth(<LoginPage onNavigate={handleNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: /back to platform/i }));

    expect(handleNavigate).toHaveBeenCalledWith('workspace');
  });
});
