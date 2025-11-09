import React from 'react'
import { AlertTriangle } from 'lucide-react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({
      error: error,
      errorInfo: errorInfo
    })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    // Reload the page to reset state
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div 
          className="min-h-screen bg-cauldron-darker p-4 md:p-6 flex items-center justify-center" 
          style={{ backgroundColor: '#050508', minHeight: '100vh' }}
        >
          <div className="text-center glass rounded-xl p-8 max-w-2xl">
            <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-100 mb-2">Something went wrong</h2>
            <p className="text-gray-400 mb-4">
              An error occurred in the PotionMaster dashboard. Please try refreshing the page.
            </p>
            
            {this.state.error && (
              <div className="mt-4 p-4 bg-red-900/20 rounded-lg text-left">
                <p className="text-sm text-red-300 font-mono mb-2">
                  {this.state.error.toString()}
                </p>
                {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                  <details className="text-xs text-gray-400 mt-2">
                    <summary className="cursor-pointer mb-2">Stack trace</summary>
                    <pre className="overflow-auto max-h-60 p-2 bg-black/30 rounded">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}
            
            <button
              onClick={this.handleReset}
              className="mt-6 px-6 py-3 bg-cauldron-purple text-white rounded-lg hover:bg-cauldron-purple/80 transition-colors font-semibold"
            >
              Reload Dashboard
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary

