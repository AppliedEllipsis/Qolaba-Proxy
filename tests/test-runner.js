import OriginalErrorScenarioTests from './test-original-error-scenarios.js'
import FixedResponseManagementTests from './test-fixed-response-management.js'
import EdgeCaseTests from './test-edge-cases.js'
import LoggingFunctionalityTests from './test-logging-functionality.js'
import PerformanceTests from './test-performance.js'
import ManualTestScript from './manual-test-script.js'

/**
 * Comprehensive test runner for header error fix verification
 */
export class TestRunner {
  constructor() {
    this.testSuites = [
      { name: 'Original Error Scenarios', class: OriginalErrorScenarioTests },
      { name: 'Fixed Response Management', class: FixedResponseManagementTests },
      { name: 'Edge Cases', class: EdgeCaseTests },
      { name: 'Logging Functionality', class: LoggingFunctionalityTests },
      { name: 'Performance Tests', class: PerformanceTests }
    ]
    
    this.results = []
    this.startTime = null
  }

  /**
   * Run all test suites
   */
  async runAllTests() {
    this.startTime = Date.now()
    
    console.log('\n🚀 Starting Comprehensive Test Suite')
    console.log('=======================================')
    console.log('Testing the fix for "Cannot set headers after they are sent to the client" error')
    console.log('')
    
    let allPassed = true
    
    for (const suite of this.testSuites) {
      console.log(`\n📋 Running Test Suite: ${suite.name}`)
      console.log('-'.repeat(50))
      
      try {
        const testSuite = new suite.class()
        const suitePassed = await testSuite.runAllTests()
        
        this.results.push({
          suite: suite.name,
          passed: suitePassed,
          summary: testSuite.collector.getSummary()
        })
        
        if (!suitePassed) {
          allPassed = false
        }
        
      } catch (error) {
        console.error(`❌ Test suite "${suite.name}" failed to execute:`, error.message)
        
        this.results.push({
          suite: suite.name,
          passed: false,
          error: error.message
        })
        
        allPassed = false
      }
    }
    
    this.printFinalSummary(allPassed)
    return allPassed
  }

  /**
   * Run specific test suite
   */
  async runTestSuite(suiteName) {
    const suite = this.testSuites.find(s => s.name.toLowerCase() === suiteName.toLowerCase())
    
    if (!suite) {
      console.error(`❌ Test suite "${suiteName}" not found`)
      console.log('Available test suites:')
      this.testSuites.forEach(s => console.log(`  - ${s.name}`))
      return false
    }
    
    this.startTime = Date.now()
    
    console.log(`\n📋 Running Test Suite: ${suite.name}`)
    console.log('-'.repeat(50))
    
    try {
      const testSuite = new suite.class()
      const suitePassed = await testSuite.runAllTests()
      
      this.results.push({
        suite: suite.name,
        passed: suitePassed,
        summary: testSuite.collector.getSummary()
      })
      
      this.printFinalSummary(suitePassed)
      return suitePassed
      
    } catch (error) {
      console.error(`❌ Test suite "${suite.name}" failed to execute:`, error.message)
      
      this.results.push({
        suite: suite.name,
        passed: false,
        error: error.message
      })
      
      this.printFinalSummary(false)
      return false
    }
  }

  /**
   * Run manual tests
   */
  async runManualTests(baseUrl = 'http://localhost:3000') {
    console.log('\n📋 Running Manual Tests')
    console.log('-'.repeat(50))
    console.log(`Base URL: ${baseUrl}`)
    
    try {
      const manualTestScript = new ManualTestScript(baseUrl)
      await manualTestScript.runAllTests()
      
      this.results.push({
        suite: 'Manual Tests',
        passed: manualTestScript.testResults.every(r => r.status === 'PASSED'),
        summary: manualTestScript.testResults
      })
      
      return true
      
    } catch (error) {
      console.error(`❌ Manual tests failed to execute:`, error.message)
      
      this.results.push({
        suite: 'Manual Tests',
        passed: false,
        error: error.message
      })
      
      return false
    }
  }

  /**
   * Print final summary
   */
  printFinalSummary(allPassed) {
    const duration = Date.now() - this.startTime
    
    console.log('\n' + '='.repeat(60))
    console.log('🏁 FINAL TEST RESULTS')
    console.log('='.repeat(60))
    
    const totalSuites = this.results.length
    const passedSuites = this.results.filter(r => r.passed).length
    const failedSuites = totalSuites - passedSuites
    
    console.log(`Total Test Suites: ${totalSuites}`)
    console.log(`Passed: ${passedSuites}`)
    console.log(`Failed: ${failedSuites}`)
    console.log(`Success Rate: ${totalSuites > 0 ? (passedSuites / totalSuites * 100).toFixed(2) : 0}%`)
    console.log(`Duration: ${duration}ms`)
    
    // Print suite details
    console.log('\n📊 Suite Details:')
    this.results.forEach(result => {
      const status = result.passed ? '✅ PASSED' : '❌ FAILED'
      console.log(`  ${status} - ${result.suite}`)
      
      if (result.summary) {
        if (result.summary.total !== undefined) {
          console.log(`    Tests: ${result.summary.total}, Passed: ${result.summary.passed}, Failed: ${result.summary.failed}`)
        }
        if (result.summary.results) {
          const failedTests = result.summary.results.filter(r => !r.passed)
          if (failedTests.length > 0) {
            console.log(`    Failed Tests: ${failedTests.map(t => t.testName).join(', ')}`)
          }
        }
      }
      
      if (result.error) {
        console.log(`    Error: ${result.error}`)
      }
    })
    
    // Overall result
    console.log('\n' + '='.repeat(60))
    if (allPassed) {
      console.log('🎉 ALL TESTS PASSED!')
      console.log('The "Cannot set headers after they are sent to the client" error has been successfully fixed.')
    } else {
      console.log('❌ SOME TESTS FAILED!')
      console.log('There may be issues with the header error fix. Please review the failed tests.')
    }
    console.log('='.repeat(60))
  }

  /**
   * Print available test suites
   */
  printAvailableSuites() {
    console.log('\n📋 Available Test Suites:')
    this.testSuites.forEach(suite => {
      console.log(`  - ${suite.name}`)
    })
    console.log('  - Manual Tests')
  }
}

// Command line interface
export class TestCLI {
  static async run() {
    const args = process.argv.slice(2)
    const command = args[0]
    const runner = new TestRunner()
    
    switch (command) {
      case 'all':
        await runner.runAllTests()
        break
        
      case 'suite':
        const suiteName = args[1]
        if (!suiteName) {
          console.error('❌ Please specify a test suite name')
          runner.printAvailableSuites()
          process.exit(1)
        }
        await runner.runTestSuite(suiteName)
        break
        
      case 'manual':
        const baseUrl = args[1] || 'http://localhost:3000'
        await runner.runManualTests(baseUrl)
        break
        
      case 'list':
        runner.printAvailableSuites()
        break
        
      default:
        this.printUsage()
        break
    }
  }
  
  static printUsage() {
    console.log(`
Test Runner Usage
=================

Commands:
  node tests/test-runner.js all                  Run all test suites
  node tests/test-runner.js suite <name>         Run specific test suite
  node tests/test-runner.js manual [url]         Run manual tests
  node tests/test-runner.js list                 List available test suites

Examples:
  node tests/test-runner.js all
  node tests/test-runner.js suite "Original Error Scenarios"
  node tests/test-runner.js manual http://localhost:3000
  node tests/test-runner.js list

Available Test Suites:
  - Original Error Scenarios
  - Fixed Response Management
  - Edge Cases
  - Logging Functionality
  - Performance Tests

Note: For manual tests, make sure the server is running first.
    `)
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  TestCLI.run()
    .catch(error => {
      console.error('Test runner execution failed:', error)
      process.exit(1)
    })
}

export default TestRunner