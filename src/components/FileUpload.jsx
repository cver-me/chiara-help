import PropTypes from "prop-types";
import { Upload, Loader2 } from "lucide-react";
import { useState } from "react";

const FileUpload = ({
  onFileSelect,
  selectedFile = null,
  accept = "*",
  loading = false,
  uploadProgress = 0,
  processingProgress = 0,
  status = null,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (loading) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const event = { target: { files: files } };
      onFileSelect(event);
    }
  };

  const getProgressText = () => {
    if (status === 'error') return 'Error processing file';
    if (status === 'processing') return `Processing: ${processingProgress}%`;
    if (loading) return `Uploading: ${uploadProgress}%`;
    if (selectedFile) return selectedFile.name;
    return 'Drag and drop a file here, or click to select';
  };

  const getProgressBar = () => {
    if (!loading && !status) return null;
    
    const progress = status === 'processing' ? processingProgress : uploadProgress;
    const color = status === 'error' ? 'bg-red-500' : 'bg-blue-500';
    
    return (
      <div className="w-full h-2 bg-gray-200 rounded-full mt-2">
        <div
          className={`h-full ${color} rounded-full transition-all duration-300`}
          style={{ width: `${progress}%` }}
        />
      </div>
    );
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        isDragging
          ? "border-blue-500 bg-blue-50"
          : "border-gray-300 hover:border-gray-400"
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <label className="cursor-pointer block">
        <input
          type="file"
          className="hidden"
          onChange={onFileSelect}
          accept={accept}
          disabled={loading}
        />
        <div className="flex flex-col items-center justify-center gap-2">
          {loading || status === 'processing' ? (
            <Loader2 className="w-8 h-8 text-stone-500 animate-spin" />
          ) : (
            <Upload className="w-8 h-8 text-gray-400" />
          )}
          <span className="text-sm text-gray-500">{getProgressText()}</span>
          {getProgressBar()}
        </div>
      </label>
    </div>
  );
};

FileUpload.propTypes = {
  onFileSelect: PropTypes.func.isRequired,
  selectedFile: PropTypes.object,
  accept: PropTypes.string,
  loading: PropTypes.bool,
  uploadProgress: PropTypes.number,
  processingProgress: PropTypes.number,
  status: PropTypes.oneOf(['processing', 'completed', 'error', null]),
};

export default FileUpload;
