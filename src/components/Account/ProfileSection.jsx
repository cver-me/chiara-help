import Select from "react-select";
import { User, Mail } from "lucide-react";
import PropTypes from "prop-types";

const ProfileSection = ({
  userData,
  handleInputChange,
  handleCountryChange,
  handleEducationChange,
  handleRoleChange,
  handleAgeRangeChange,
  t,
  selectStyles,
  countryOptions,
  educationOptions,
  roleOptions,
  ageRangeOptions,
  auth,
  selectedCountry,
  selectedEducation,
  selectedRole,
  selectedAgeRange,
}) => {
  return (
    <section
      id="profile"
      className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden scroll-mt-24"
    >
      <div className="px-6 py-4 border-b border-stone-200 bg-stone-50">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-stone-500" />
          <h2 className="text-base font-semibold text-stone-900">
            {t("account.profile.title")}
          </h2>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Profile Picture Section */}
        <div className="flex items-start gap-4 pb-6 border-b border-stone-200">
          {auth.currentUser?.photoURL ? (
            <img
              src={auth.currentUser.photoURL}
              alt="Profile"
              className="w-20 h-20 rounded-full object-cover border-2 border-stone-200"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-stone-100 flex items-center justify-center border-2 border-stone-200">
              <User className="w-8 h-8 text-stone-400" />
            </div>
          )}
          <div>
            <h3 className="text-sm font-medium text-stone-900">
              {t("account.profile.profilePicture")}
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              {t("account.profile.profilePictureSync")}
            </p>
            {auth.currentUser?.photoURL && (
              <p className="mt-1 text-xs text-stone-500">
                {t("account.profile.profilePictureUpdate")}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              {t("account.profile.displayName")}
            </label>
            <input
              type="text"
              name="displayName"
              value={userData.displayName}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-stone-500 text-stone-900 text-sm transition-colors"
              placeholder={t("account.profile.displayNamePlaceholder")}
            />
            <p className="mt-1 text-xs text-stone-500">
              {t("account.profile.displayNameHelp")}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              {t("account.profile.fullName")}
            </label>
            <input
              type="text"
              name="fullName"
              value={userData.fullName}
              disabled
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-stone-500 text-sm cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-stone-500">
              {t("account.profile.fullNameHelp")}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              {t("account.profile.country")}
            </label>
            <Select
              value={selectedCountry}
              onChange={handleCountryChange}
              options={countryOptions}
              styles={selectStyles}
              className="text-sm"
              placeholder={t("account.profile.countryPlaceholder")}
              isClearable={false}
              menuPortalTarget={document.body}
              menuPosition="fixed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              {t("account.profile.ageRange")}
            </label>
            <Select
              value={selectedAgeRange}
              onChange={handleAgeRangeChange}
              options={ageRangeOptions}
              styles={selectStyles}
              className="text-sm"
              placeholder={t("account.profile.ageRangePlaceholder")}
              isClearable={false}
              menuPortalTarget={document.body}
              menuPosition="fixed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              {t("account.profile.role")}
            </label>
            <Select
              value={selectedRole}
              onChange={handleRoleChange}
              options={roleOptions}
              styles={selectStyles}
              className="text-sm"
              placeholder={t("account.profile.rolePlaceholder")}
              isClearable={false}
              menuPortalTarget={document.body}
              menuPosition="fixed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              {t("account.profile.educationLevel")}
            </label>
            <Select
              value={selectedEducation}
              onChange={handleEducationChange}
              options={educationOptions}
              styles={selectStyles}
              className="text-sm"
              placeholder={t("account.profile.educationLevelPlaceholder")}
              isClearable={false}
              menuPortalTarget={document.body}
              menuPosition="fixed"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-stone-700 mb-1">
              {t("account.profile.email")}
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 w-4 h-4 text-stone-400" />
              <input
                type="email"
                value={userData.email}
                disabled
                className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-stone-500 text-sm cursor-not-allowed"
              />
            </div>
            <p className="mt-1 text-xs text-stone-500">
              {t("account.profile.emailHelp")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

ProfileSection.propTypes = {
  userData: PropTypes.object.isRequired,
  handleInputChange: PropTypes.func.isRequired,
  handleCountryChange: PropTypes.func.isRequired,
  handleEducationChange: PropTypes.func.isRequired,
  handleRoleChange: PropTypes.func.isRequired,
  handleAgeRangeChange: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
  selectStyles: PropTypes.object.isRequired,
  countryOptions: PropTypes.array.isRequired,
  educationOptions: PropTypes.array.isRequired,
  roleOptions: PropTypes.array.isRequired,
  ageRangeOptions: PropTypes.array.isRequired,
  auth: PropTypes.object.isRequired,
  selectedCountry: PropTypes.object,
  selectedEducation: PropTypes.object,
  selectedRole: PropTypes.object,
  selectedAgeRange: PropTypes.object,
};

export default ProfileSection;
