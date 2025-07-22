import { Link } from "react-router-dom";
import { auth, db } from "../../utils/firebase";
import { signOut } from "firebase/auth";
import { LogOut, User, ChevronDown, Settings } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useTranslation } from "react-i18next";

const Header = () => {
  const { t } = useTranslation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [userData, setUserData] = useState(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const fetchUserData = async () => {
      const user = auth.currentUser;
      if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        }
      }
    };

    fetchUserData();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsDropdownOpen(false);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="fixed top-0 right-0 left-0 z-50">
      <div className="w-full h-12 px-4 flex justify-between items-center bg-white shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 pl-12 lg:pl-0">
            <Link to="/start" className="flex items-center gap-2">
              <span className="font-display text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-stone-900 to-stone-700">
                Chiara
              </span>
              <span className="px-2 py-0.5 bg-gradient-to-r from-amber-50 to-stone-50 text-stone-600 text-xs rounded-full font-medium border border-stone-200">
                Beta
              </span>
            </Link>
          </div>
        </div>
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-2"
          >
            {auth.currentUser?.photoURL ? (
              <img
                src={auth.currentUser.photoURL}
                alt="Profile"
                className="w-6 h-6 rounded-full object-cover"
              />
            ) : (
              <User className="w-5 h-5" />
            )}
            <ChevronDown className="w-4 h-4" />
          </button>
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg py-2 border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-3 mb-2">
                  {auth.currentUser?.photoURL ? (
                    <img
                      src={auth.currentUser.photoURL}
                      alt="Profile"
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <User className="w-5 h-5 text-gray-500" />
                    </div>
                  )}
                  <div>
                    <div className="font-medium text-gray-900">
                      {userData?.displayName || t("header.defaultUser")}
                    </div>
                    <div className="text-sm text-gray-500 capitalize">
                      {userData?.role || t("header.defaultRole")}
                    </div>
                  </div>
                </div>
              </div>
              <Link
                to="/account"
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                onClick={() => setIsDropdownOpen(false)}
              >
                <Settings className="w-4 h-4" />
                {t("header.accountSettings")}
              </Link>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                {t("header.signOut")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
